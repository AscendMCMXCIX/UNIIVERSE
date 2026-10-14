import { sql } from "drizzle-orm";
import { defineJob } from "./registry";
import { probeLineup } from "./engine-probe";
import { applyAction, deriveDraft, type DraftState } from "@/domain/draft";
import { recommend, type BanRecommendation, type EnemyTendencies, type PairRecommendation, type PickRecommendation, type RecommendationResult, type StatsProvider } from "@/domain/engine";
import { RIOT_POSITION_TO_ROLE, ROLES, type Role } from "@/domain/roles";
import { parseTierWeights, shrinkRate, tierWeight, wilsonInterval, type ShrunkRate } from "@/domain/stats";
import type { PlayerProfile } from "@/domain/roster/types";
import { getChampionMap } from "@/server/engine/service";
import { loadStatsProvider } from "@/server/stats/loader";
import { getProficiencyLookup, invalidateProficiencyCache } from "@/server/proficiency/service";
import { getOrCreateTeam } from "@/server/repositories/team";
import { getCurrentPatch } from "@/server/repositories/champions";

/**
 * Read-only data sufficiency audit (Phase 4, stage A). Answers "is there enough evidence behind
 * the draft engine, and how fresh is it?" from the data actually stored and from the engine's
 * own statistics provider:
 *
 *  - collection: games stored, folded into statistics and waiting, by patch, region, ladder band
 *    and day; the fetch queue; how often each scheduled job really ran in the last seven days;
 *  - evidence behind real drafts: for the lanes, key pairs and champions of recent ranked games,
 *    how many (patch- and rank-weighted) games the engine actually has for each signal;
 *  - named matchup and pairing examples with their samples and uncertainty;
 *  - draft scenarios run through the engine on fixtures built in memory (nothing is saved);
 *  - a held-out check: games not yet folded into statistics, predicted from the statistics.
 *
 * Players appear by role only. Changes nothing.
 */

type Row = Record<string, unknown>;
const rows = (result: unknown): Row[] => ((result as { rows?: Row[] }).rows ?? (result as Row[])) as Row[];
const num = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/** Sample-size buckets in effective games; the last edge is the shrinkage prior (confidence 0.5). */
function buckets(values: number[], edges: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  const labels = edges.map((e, i) => (i === 0 ? `<${e}` : `${edges[i - 1]}-${e - 1}`)).concat(`>=${edges[edges.length - 1]}`);
  for (const l of labels) out[l] = 0;
  for (const v of values) {
    const i = edges.findIndex((e) => v < e);
    out[labels[i === -1 ? labels.length - 1 : i]!]! += 1;
  }
  for (const l of labels) out[l] = pct(out[l]!, values.length);
  return out;
}

/**
 * Sufficiency of one signal from the share of real draft situations whose evidence reaches the
 * prior weight (confidence ≥ 0.5) and a quarter of it.
 */
function sufficiency(values: number[], priorWeight: number): { verdict: "Sufficient" | "Limited" | "Insufficient"; atPrior: number; atQuarterPrior: number; median: number; situations: number } {
  const sorted = [...values].sort((a, b) => a - b);
  const atPrior = pct(values.filter((v) => v >= priorWeight).length, values.length);
  const atQuarterPrior = pct(values.filter((v) => v >= priorWeight / 4).length, values.length);
  const verdict = atPrior >= 70 ? "Sufficient" : atQuarterPrior >= 50 ? "Limited" : "Insufficient";
  return { verdict, atPrior, atQuarterPrior, median: r2(sorted[Math.floor(sorted.length / 2)] ?? 0), situations: values.length };
}

interface GameTeams {
  matchId: string;
  patch: string;
  /** Evidence weight of this game in the statistics (its ladder band's weight). */
  weight: number;
  blueWin: boolean;
  blue: Map<Role, string>;
  red: Map<Role, string>;
}

/** Ranked games with five clear roles per side (the same rule aggregation uses). */
async function loadGames(db: Parameters<typeof getChampionMap>[0], where: ReturnType<typeof sql>): Promise<GameTeams[]> {
  const data = rows(
    await db.execute(sql`
      SELECT m.match_id, m.patch, m.tier_band, m.winning_team_id, p.team_id, coalesce(p.champion_id, c.id) AS champion, p.position
      FROM ranked_matches m
      JOIN ranked_participants p ON p.match_id = m.match_id
      LEFT JOIN champions c ON c.key = p.champion_key
      WHERE ${where}`),
  );
  const games = new Map<string, GameTeams>();
  const weights = parseTierWeights(process.env.RIOT_TIER_WEIGHTS);
  for (const r of data) {
    const id = String(r.match_id);
    const g = games.get(id) ?? { matchId: id, patch: String(r.patch), weight: tierWeight(r.tier_band as string | null, weights), blueWin: num(r.winning_team_id) === 100, blue: new Map(), red: new Map() };
    const role = RIOT_POSITION_TO_ROLE[String(r.position)];
    if (role && r.champion) (num(r.team_id) === 100 ? g.blue : g.red).set(role, String(r.champion));
    games.set(id, g);
  }
  return [...games.values()].filter((g) => g.blue.size === 5 && g.red.size === 5);
}

const KEY_PAIRS: Array<[Role, Role]> = [
  ["TOP", "JUNGLE"],
  ["JUNGLE", "MID"],
  ["ADC", "SUPPORT"],
];

/** Effective evidence the engine holds for each signal in real drafts. */
function evidenceInGames(games: GameTeams[], stats: StatsProvider) {
  const strength: number[] = [];
  const lane: number[] = [];
  const pair: number[] = [];
  for (const g of games) {
    for (const role of ROLES) {
      const b = g.blue.get(role)!;
      const r = g.red.get(role)!;
      strength.push(stats.strength(b, role).games, stats.strength(r, role).games);
      lane.push(stats.matchup(b, role, r, role, 0.5).games);
    }
    for (const side of [g.blue, g.red]) for (const [a, b] of KEY_PAIRS) pair.push(stats.synergy(side.get(a)!, a, side.get(b)!, b, 0.5).games);
  }
  return { strength, lane, pair };
}

/**
 * Leave-one-out: the same estimate with this game's own contribution taken back out (its result,
 * at its evidence weight), re-shrunk towards `prior`. Exact for games on the current patch, which
 * enter the statistics at full patch weight; the check only uses those.
 */
function without(rate: ShrunkRate, won: boolean, weight: number, prior = rate.prior): ShrunkRate {
  if (weight <= 0 || rate.games <= 0) return shrinkRate({ wins: (rate.raw ?? 0) * rate.games, games: rate.games }, prior, rate.priorWeight);
  const games = Math.max(0, rate.games - weight);
  const wins = Math.min(games, Math.max(0, (rate.raw ?? 0) * rate.games - (won ? weight : 0)));
  return shrinkRate({ wins, games }, prior, rate.priorWeight);
}

/**
 * Win probability for blue from the statistics only (no players, no composition model): per lane,
 * the matchup estimate shrunk towards the two champions' strengths, plus key-pair synergy. With
 * `leaveOut`, the game's own contribution is removed from every estimate first.
 */
function predictBlue(g: GameTeams, stats: StatsProvider, withMatchups: boolean, withSynergy: boolean, leaveOut = false): { p: number; evidence: number } {
  const w = leaveOut ? g.weight : 0;
  let edge = 0;
  let evidence = 0;
  for (const role of ROLES) {
    const b = g.blue.get(role)!;
    const r = g.red.get(role)!;
    const sb = without(stats.strength(b, role), g.blueWin, w);
    const sr = without(stats.strength(r, role), !g.blueWin, w);
    const prior = 0.5 + (sb.estimate - 0.5) - (sr.estimate - 0.5);
    evidence += (sb.confidence + sr.confidence) / 2;
    edge += withMatchups ? without(stats.matchup(b, role, r, role, prior), g.blueWin, w, prior).estimate - 0.5 : prior - 0.5;
  }
  if (withSynergy) {
    for (const [a, b] of KEY_PAIRS) {
      edge += without(stats.synergy(g.blue.get(a)!, a, g.blue.get(b)!, b, 0.5), g.blueWin, w).estimate - 0.5;
      edge -= without(stats.synergy(g.red.get(a)!, a, g.red.get(b)!, b, 0.5), !g.blueWin, w).estimate - 0.5;
    }
  }
  return { p: Math.min(0.95, Math.max(0.05, 0.5 + edge)), evidence: evidence / ROLES.length };
}

function scorePredictions(games: GameTeams[], stats: StatsProvider, withMatchups: boolean, withSynergy: boolean, leaveOut = false) {
  let correct = 0;
  let brier = 0;
  let logLoss = 0;
  const byMargin: Record<string, { games: number; correct: number }> = { "<2pt": { games: 0, correct: 0 }, "2-5pt": { games: 0, correct: 0 }, ">=5pt": { games: 0, correct: 0 } };
  const byEvidence: Record<string, { games: number; correct: number }> = { low: { games: 0, correct: 0 }, high: { games: 0, correct: 0 } };
  for (const g of games) {
    const { p, evidence } = predictBlue(g, stats, withMatchups, withSynergy, leaveOut);
    const y = g.blueWin ? 1 : 0;
    const hit = p === 0.5 ? 0.5 : (p > 0.5) === g.blueWin ? 1 : 0;
    correct += hit;
    brier += (p - y) ** 2;
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    const m = Math.abs(p - 0.5);
    const mk = m < 0.02 ? "<2pt" : m < 0.05 ? "2-5pt" : ">=5pt";
    byMargin[mk]!.games += 1;
    byMargin[mk]!.correct += hit;
    const ek = evidence >= 0.5 ? "high" : "low";
    byEvidence[ek]!.games += 1;
    byEvidence[ek]!.correct += hit;
  }
  const n = games.length;
  const ci = wilsonInterval(correct, n);
  const acc = (b: { games: number; correct: number }) => ({ games: b.games, accuracy: pct(b.correct, b.games) });
  return {
    games: n,
    accuracy: pct(correct, n),
    accuracy95: [r3(ci.low), r3(ci.high)],
    brier: n ? r3(brier / n) : null,
    brierCoinFlip: 0.25,
    logLoss: n ? r3(logLoss / n) : null,
    logLossCoinFlip: r3(Math.log(2)),
    byMargin: Object.fromEntries(Object.entries(byMargin).map(([k, v]) => [k, acc(v)])),
    byEvidence: Object.fromEntries(Object.entries(byEvidence).map(([k, v]) => [k, acc(v)])),
  };
}

defineJob({
  key: "data-sufficiency",
  description: "Read-only: how much evidence stands behind each draft signal, how fast data arrives, draft scenarios on in-memory fixtures and a held-out accuracy check. Changes nothing.",
  defaultIntervalMinutes: null,
  allowConcurrent: true,
  run: async (ctx) => {
    const db = ctx.db;
    const current = await getCurrentPatch(db);
    const team = await getOrCreateTeam(db);
    const [champions, stats] = await Promise.all([getChampionMap(db), loadStatsProvider(db)]);
    const name = (id: string | null | undefined) => (id ? (champions.get(id)?.name ?? id) : null);
    const described = stats.describe();

    // ---- Collection: stored, folded into statistics, waiting; arrival rate; schedule reality.
    const byPatch = rows(
      await db.execute(sql`
        SELECT patch, queue_id, count(*) AS games, count(aggregated_at) AS aggregated,
          count(*) FILTER (WHERE ingested_at > now() - interval '24 hours') AS last24h,
          count(*) FILTER (WHERE ingested_at > now() - interval '7 days') AS last7d,
          min(to_timestamp(game_creation / 1000.0)) AS oldest, max(to_timestamp(game_creation / 1000.0)) AS newest
        FROM ranked_matches GROUP BY 1, 2 ORDER BY 1 DESC, 2`),
    ).map((r) => ({ patch: r.patch, queue: num(r.queue_id), games: num(r.games), aggregated: num(r.aggregated), waiting: num(r.games) - num(r.aggregated), last24h: num(r.last24h), last7d: num(r.last7d), oldest: r.oldest, newest: r.newest }));
    const perDay = rows(
      await db.execute(sql`SELECT to_char(date_trunc('day', ingested_at), 'YYYY-MM-DD') AS day, count(*) AS games FROM ranked_matches WHERE ingested_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`),
    ).map((r) => ({ day: r.day, games: num(r.games) }));
    const reliable = rows(
      await db.execute(sql`
        SELECT m.patch, count(*) AS games,
          count(*) FILTER (WHERE (SELECT count(DISTINCT p.position) FROM ranked_participants p WHERE p.match_id = m.match_id AND p.position <> 'UNKNOWN') = 5
            AND (SELECT count(*) FROM ranked_participants p WHERE p.match_id = m.match_id AND p.position <> 'UNKNOWN') = 10) AS clear_roles
        FROM ranked_matches m GROUP BY 1 ORDER BY 1 DESC`),
    ).map((r) => ({ patch: r.patch, games: num(r.games), clearRoles: num(r.clear_roles) }));
    const regionBand = rows(
      await db.execute(sql`
        SELECT platform, coalesce(tier_band, 'MASTER+ (legacy)') AS band, count(*) AS games FROM ranked_matches
        WHERE patch = ${current?.patch ?? ""} GROUP BY 1, 2 ORDER BY 1, 2`),
    );
    const regions: Record<string, number> = {};
    const bands: Record<string, number> = {};
    for (const r of regionBand) {
      regions[String(r.platform)] = (regions[String(r.platform)] ?? 0) + num(r.games);
      bands[String(r.band)] = (bands[String(r.band)] ?? 0) + num(r.games);
    }
    const currentTotal = Object.values(regions).reduce((s, n) => s + n, 0);
    const queue = rows(
      await db.execute(sql`
        SELECT status, coalesce(tier_band, '-') AS band, count(*) AS n, count(*) FILTER (WHERE discovered_at > now() - interval '24 hours') AS new24h
        FROM match_fetch_queue GROUP BY 1, 2 ORDER BY 1, 2`),
    ).map((r) => ({ status: r.status, band: r.band, n: num(r.n), discovered24h: num(r.new24h) }));
    const tracked = rows(
      await db.execute(sql`
        SELECT tier, count(*) AS players, count(last_match_list_at) AS scanned,
          count(*) FILTER (WHERE last_match_list_at > now() - interval '7 days') AS scanned7d
        FROM tracked_summoners GROUP BY 1 ORDER BY 2 DESC`),
    ).map((r) => ({ tier: r.tier, players: num(r.players), everScanned: num(r.scanned), scannedLast7d: num(r.scanned7d) }));
    const jobs = rows(
      await db.execute(sql`
        SELECT job, trigger, count(*) AS runs, count(*) FILTER (WHERE ok = 'true') AS ok, count(*) FILTER (WHERE ok = 'false') AS failed,
          round(avg(duration_ms)) AS avg_ms, max(started_at) AS last
        FROM job_runs WHERE started_at > now() - interval '7 days' GROUP BY 1, 2 ORDER BY 1, 2`),
    ).map((r) => ({ job: r.job, trigger: r.trigger, runs: num(r.runs), ok: num(r.ok), failed: num(r.failed), avgSeconds: Math.round(num(r.avg_ms) / 100) / 10, last: r.last }));
    const tickStarts = rows(await db.execute(sql`SELECT started_at, trigger, ok FROM job_runs WHERE job = 'tick' ORDER BY started_at DESC LIMIT 30`)).map((r) => ({ at: r.started_at, trigger: r.trigger, ok: r.ok }));
    const ingestRuns = rows(await db.execute(sql`SELECT started_at, trigger, ok, duration_ms, summary FROM job_runs WHERE job = 'ranked-ingest' ORDER BY started_at DESC LIMIT 12`)).map((r) => ({ at: r.started_at, trigger: r.trigger, ok: r.ok, seconds: Math.round(num(r.duration_ms) / 1000), summary: r.summary }));
    const failures = rows(await db.execute(sql`SELECT job, started_at, left(coalesce(error, ''), 160) AS error FROM job_runs WHERE ok = 'false' AND started_at > now() - interval '7 days' ORDER BY started_at DESC LIMIT 15`));
    const pro = rows(await db.execute(sql`SELECT patch, count(*) AS games, count(aggregated_at) AS aggregated, max(played_at) AS newest FROM pro_games GROUP BY 1 ORDER BY 1 DESC LIMIT 6`).catch(() => [] as never)).map((r) => ({ patch: r.patch, games: num(r.games), aggregated: num(r.aggregated), newest: r.newest }));
    const drafts = rows(await db.execute(sql`SELECT count(*) AS drafts, count(*) FILTER (WHERE enemy_players::text <> '{}') AS with_enemies FROM drafts`))[0] ?? {};
    const scouting = rows(await db.execute(sql`SELECT count(*) AS n, count(DISTINCT draft_id) AS drafts FROM draft_enemy_scouting`).catch(() => [] as never))[0] ?? {};
    const rows7d = rows(await db.execute(sql`SELECT count(*) AS bans FROM ranked_bans b JOIN ranked_matches m ON m.match_id = b.match_id WHERE m.patch = ${current?.patch ?? ""}`))[0] ?? {};

    // ---- Evidence behind real drafts: the lanes, pairs and champions of recent ranked games.
    const recent = await loadGames(db, sql`m.ingested_at > now() - interval '7 days' AND m.queue_id = 420`);
    const ev = evidenceInGames(recent, stats);
    const traitTeams = recent.slice(0, 4000);
    // Composition archetypes have no measured table: check the curated traits against outcomes.
    const traitCheck = (trait: "engage" | "frontline" | "counterEngage" | "poke" | "scaling", margin: number) => {
      let games = 0;
      let wins = 0;
      for (const g of traitTeams) {
        const sum = (t: Map<Role, string>) => [...t.values()].reduce((s, c) => s + (champions.get(c)?.profile.traits[trait] ?? 0), 0);
        const d = sum(g.blue) - sum(g.red);
        if (Math.abs(d) < margin) continue;
        games += 1;
        if ((d > 0) === g.blueWin) wins += 1;
      }
      const ci = wilsonInterval(wins, games);
      return { trait, margin, games, higherTeamWinRate: pct(wins, games), ci95: [r3(ci.low), r3(ci.high)] };
    };

    // ---- Named examples.
    const describeMatchup = (a: string, role: Role, b: string, enemyRole: Role = role) => {
      const sa = stats.strength(a, role);
      const sb = stats.strength(b, enemyRole);
      const prior = 0.5 + (sa.estimate - 0.5) - (sb.estimate - 0.5);
      const m = stats.matchup(a, role, b, enemyRole, prior);
      const ci = m.games > 0 && m.raw !== null ? wilsonInterval(m.raw * m.games, m.games) : null;
      return {
        matchup: `${name(a)} (${role}) vs ${name(b)} (${enemyRole})`,
        effectiveGames: r2(m.games),
        observedWinRate: m.raw === null ? null : pct(m.raw, 1),
        observed95: ci ? [r3(ci.low), r3(ci.high)] : null,
        estimate: pct(m.estimate, 1),
        priorFromStrength: pct(prior, 1),
        confidence: r2(m.confidence),
        strengthGames: [r2(sa.games), r2(sb.games)],
        fallback: m.games < 15 ? "champion strength in role plus curated characteristics" : null,
      };
    };
    const describePair = (a: string, ra: Role, b: string, rb: Role) => {
      const s = stats.synergy(a, ra, b, rb, 0.5);
      return { pair: `${name(a)} (${ra}) + ${name(b)} (${rb})`, effectiveGames: r2(s.games), observedWinRate: s.raw === null ? null : pct(s.raw, 1), estimate: pct(s.estimate, 1), confidence: r2(s.confidence) };
    };
    const topJungle = rows(
      await db.execute(sql`
        SELECT champion_a_id, role_a, champion_b_id, role_b, sum(games) AS games FROM champion_synergies
        WHERE source = 'ranked' AND patch = ${current?.patch ?? ""} AND ((role_a = 'TOP' AND role_b = 'JUNGLE') OR (role_a = 'JUNGLE' AND role_b = 'TOP'))
        GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 5`),
    ).map((r) => describePair(String(r.champion_a_id), r.role_a as Role, String(r.champion_b_id), r.role_b as Role));
    const commonLanes = rows(
      await db.execute(sql`
        SELECT champion_id, role, enemy_champion_id, enemy_role, sum(games) AS games FROM champion_matchups
        WHERE source = 'ranked' AND patch = ${current?.patch ?? ""} AND role = enemy_role AND champion_id < enemy_champion_id
        GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 5`),
    ).map((r) => describeMatchup(String(r.champion_id), r.role as Role, String(r.enemy_champion_id), r.enemy_role as Role));
    const matchupRows = rows(
      await db.execute(sql`
        SELECT count(*) AS rows, count(*) FILTER (WHERE games >= 2) AS ge2, count(*) FILTER (WHERE games >= 10) AS ge10, count(*) FILTER (WHERE games >= 30) AS ge30
        FROM champion_matchups WHERE source = 'ranked' AND patch = ${current?.patch ?? ""} AND role = enemy_role`),
    )[0] ?? {};
    const roleRows = rows(
      await db.execute(sql`
        SELECT count(*) AS rows, count(*) FILTER (WHERE g >= 50) AS ge50, count(*) FILTER (WHERE g >= 250) AS ge250 FROM (
          SELECT champion_id, role, sum(games) AS g FROM champion_role_stats WHERE source = 'ranked' AND patch = ${current?.patch ?? ""} GROUP BY 1, 2) x`),
    )[0] ?? {};

    // ---- Draft scenarios (in memory; nothing is saved).
    const roleChampions = (role: Role) => stats.topChampionsInRole(role, 60).filter((c) => (champions.get(c)?.profile.rolePrior[role] ?? 0) >= 0.3).slice(0, 5);
    const lineup = await probeLineup(db, team.id, roleChampions);
    invalidateProficiencyCache();
    const realIds = lineup.players.filter((p) => !p.id.startsWith("placeholder-")).map((p) => p.id);
    const proficiency = await getProficiencyLookup(db, realIds);
    const config = team.engineConfig as never;

    const pickView = (p: PickRecommendation) => ({
      champion: name(p.championId),
      role: p.role,
      score: r3(p.score),
      why: p.why.slice(0, 2),
      breakdown: Object.fromEntries(p.breakdown.items.map((i) => [i.key, r3(i.value)])),
      evidence: p.breakdown.evidence,
      proficiency: p.breakdown.proficiency,
      strengthGames: r2(stats.strength(p.championId, p.role).games),
    });
    const view = (r: RecommendationResult) => {
      const primary = r.primary;
      const one = (x: typeof primary) =>
        !x ? null : x.kind === "pick" ? pickView(x) : x.kind === "pair" ? { pair: (x as PairRecommendation).picks.map(pickView), score: r3(x.score) } : { ban: name((x as BanRecommendation).championId), likelyRole: (x as BanRecommendation).likelyRole, protects: (x as BanRecommendation).protects.map((p) => p.role), score: r3(x.score), why: x.why.slice(0, 2) };
      const alt = (x: (typeof r.alternatives)[number]) => (x.kind === "pick" ? `${name(x.championId)} ${x.role} ${r3(x.score)}` : x.kind === "pair" ? `${x.picks.map((p) => `${name(p.championId)} ${p.role}`).join(" + ")} ${r3(x.score)}` : `ban ${name(x.championId)} ${r3(x.score)}`);
      const enemyLanes = r.kind === "pick" && primary?.kind === "pick" ? r.enemy.roles.filter((e) => e.mostLikely === primary.role).map((e) => ({ enemy: name(e.championId), laneGames: r2(stats.matchup(primary.championId, primary.role, e.championId, e.mostLikely, 0.5).games) })) : [];
      return {
        step: r.step ? `${r.step.side} ${r.step.type} ${r.step.ordinal}` : null,
        kind: r.kind,
        primary: one(primary),
        alternatives: r.alternatives.slice(0, 3).map(alt),
        decision: r.decision ? { label: r.decision.label, gap: r.decision.gap === null ? null : r3(r.decision.gap), reason: r.decision.reason } : null,
        evidenceConfidence: r.confidence,
        enemyInLane: enemyLanes,
        needs: r.needs.slice(0, 3).map((n) => (n as { label?: string; key?: string }).label ?? (n as { key?: string }).key ?? n),
        emergency: r.emergency.map((e) => ({ role: e.role, suggestions: e.suggestions.slice(0, 3).map((s) => `${name(s.championId)}${s.familiarity ? ` (${s.familiarity.label})` : ""}`) })),
        playersWithData: r.playerData.withData.length,
        ms: r.computeMs,
      };
    };

    type Step = string | null | "engine";
    const simulate = (opts: { side: "blue" | "red"; formatId: string; script: Step[]; players?: PlayerProfile[]; tendencies?: EnemyTendencies | null; unavailable?: string[] }) => {
      const players = opts.players ?? lineup.players;
      let state: DraftState = { side: opts.side, formatId: opts.formatId, actions: [], assignments: { ...lineup.assignment }, unavailableChampionIds: opts.unavailable ?? [] };
      const run = () => recommend({ players, draft: state, champions, stats, config, proficiency, tendencies: opts.tendencies ?? null });
      const notes: string[] = [];
      for (const step of opts.script) {
        let input: { championId: string | null; role?: Role | null; playerId?: string | null } = { championId: step === "engine" ? null : step };
        if (step === "engine") {
          const r = run();
          const p = r.primary;
          if (p?.kind === "pick") input = { championId: p.championId, role: p.role, playerId: p.playerId };
          else if (p?.kind === "pair") input = { championId: p.picks[0].championId, role: p.picks[0].role, playerId: p.picks[0].playerId };
          else if (p?.kind === "ban") input = { championId: p.championId };
        }
        const res = applyAction(state, input);
        if (res.ok) state = res.state;
        else notes.push(`${String(step)}: ${res.error}`);
      }
      const derived = deriveDraft(state);
      return {
        ...view(run()),
        board: { ours: derived.ourPicks.map((p) => `${name(p.championId)} ${p.role ?? ""}`.trim()), enemy: derived.enemyPicks.map((p) => name(p.championId)), bans: [...derived.bannedChampionIds].map(name) },
        notes,
      };
    };
    const tenNullBans: Step[] = Array.from({ length: 10 }, () => null);
    const sixNullBans: Step[] = Array.from({ length: 6 }, () => null);
    const topPool = lineup.players.find((p) => p.id === lineup.assignment.TOP)!;
    const topMain = topPool.primaryPool[0] ?? stats.topChampionsInRole("TOP", 1)[0]!;
    // The strongest observed counter to the top player's first champion (≥ 10 effective games).
    const counter = stats
      .topChampionsInRole("TOP", 40)
      .filter((c) => c !== topMain)
      .map((c) => ({ c, m: stats.matchup(topMain, "TOP", c, "TOP", 0.5) }))
      .filter((x) => x.m.games >= 10)
      .sort((a, b) => a.m.estimate - b.m.estimate)[0];
    const tendencies: EnemyTendencies = {
      TOP: { role: "TOP", label: "scouted top", confidence: 0.7, confidenceLabel: "high", factors: ["fixture"], picks: [{ championId: "Gwen", probability: 0.45, games: 60, recentGames: 20, patchGames: 12, tier: "core", likelihood: "high" }, { championId: "Jax", probability: 0.25, games: 30, recentGames: 8, patchGames: 4, tier: "comfortable", likelihood: "moderate" }], gamesAnalysed: 100, rank: null },
      JUNGLE: { role: "JUNGLE", label: "scouted jungle", confidence: 0.6, confidenceLabel: "medium", factors: ["fixture"], picks: [{ championId: "Viego", probability: 0.4, games: 40, recentGames: 15, patchGames: 9, tier: "core", likelihood: "high" }], gamesAnalysed: 80, rank: null },
    };
    const limited = lineup.players.map((p) => ({ ...p, primaryPool: p.primaryPool.slice(0, 1), secondaryPool: [] }));
    const scenarios: Record<string, unknown> = {};
    const tryScenario = (key: string, f: () => unknown) => {
      try {
        scenarios[key] = f();
      } catch (e) {
        scenarios[key] = { error: e instanceof Error ? e.message : String(e) };
      }
    };
    tryScenario("blindFlexFirstPick", () => simulate({ side: "blue", formatId: "ranked-flex", script: tenNullBans }));
    tryScenario("tournamentFirstBan", () => simulate({ side: "blue", formatId: "tournament", script: [] }));
    tryScenario("tournamentFirstPickAfterBans", () => simulate({ side: "blue", formatId: "tournament", script: ["engine", null, "engine", null, "engine", null] }));
    tryScenario("knownEnemiesLastPick", () => simulate({ side: "red", formatId: "ranked-flex", script: [...tenNullBans, "Ornn", "engine", "engine", "Sejuani", "Orianna", "engine", "engine", "Jinx", "Leona"] }));
    tryScenario("partialScouting", () => ({ withScouting: simulate({ side: "blue", formatId: "tournament", script: [] , tendencies }), withoutScouting: simulate({ side: "blue", formatId: "tournament", script: [] }) }));
    tryScenario("strongEnemyFrontline", () => simulate({ side: "blue", formatId: "ranked-flex", script: [...tenNullBans, "engine", "Ornn", "Sejuani"] }));
    tryScenario("highEngageEnemy", () => simulate({ side: "blue", formatId: "ranked-flex", script: [...tenNullBans, "engine", "Malphite", "Rell"] }));
    tryScenario("poorMatchupCounterPick", () => ({ counter: counter ? `${name(counter.c)} vs ${name(topMain)}: ${pct(counter.m.estimate, 1)}% over ${r2(counter.m.games)} games` : "no counter with 10+ games", result: counter ? simulate({ side: "red", formatId: "ranked-flex", script: [...tenNullBans, counter.c] }) : null }));
    tryScenario("limitedPools", () => simulate({ side: "blue", formatId: "ranked-flex", script: tenNullBans, players: limited }));
    tryScenario("emergencyTopPoolGone", () => simulate({ side: "blue", formatId: "tournament", script: sixNullBans, unavailable: [...topPool.primaryPool, ...topPool.secondaryPool] }));

    // ---- Held-out check: games not yet folded into statistics.
    const heldOut = await loadGames(db, sql`m.aggregated_at IS NULL AND m.queue_id = 420`);
    const blueRate = (gs: GameTeams[]) => pct(gs.filter((g) => g.blueWin).length, gs.length);
    const heldOutCheck = {
      note: "Games stored but not yet folded into the statistics, so they never informed the estimates. Small samples: read the 95% interval.",
      games: heldOut.length,
      blueWinRate: blueRate(heldOut),
      strengthOnly: scorePredictions(heldOut, stats, false, false),
      strengthAndMatchups: scorePredictions(heldOut, stats, true, false),
      strengthMatchupsAndPairs: scorePredictions(heldOut, stats, true, true),
    };
    // Leave-one-out on the current patch's folded games: each game is predicted from statistics
    // with its own result removed, so it never informs its own prediction. Large and honest.
    const heldOutIds = new Set(heldOut.map((h) => h.matchId));
    const folded = recent.filter((g) => !heldOutIds.has(g.matchId) && g.patch === (current?.patch ?? described.patch));
    const leaveOneOut = {
      note: "Every folded game on the current patch, predicted from statistics with that game's own result taken out (leave-one-out). Rework discounts are ignored (rare).",
      games: folded.length,
      blueWinRate: blueRate(folded),
      strengthOnly: scorePredictions(folded, stats, false, false, true),
      strengthAndMatchups: scorePredictions(folded, stats, true, false, true),
      strengthMatchupsAndPairs: scorePredictions(folded, stats, true, true, true),
    };
    const inSample = folded.slice(0, 1500);
    const inSampleCheck = { note: "Same check on games already inside the statistics: an optimistic upper bound (the games inform their own estimates).", ...scorePredictions(inSample, stats, true, true) };

    return {
      ok: true,
      summary: {
        currentPatch: current?.patch ?? null,
        engineSees: { patch: described.patch, sources: described.sources, effectiveGames: Math.round(described.totalGames), patches: described.provenance?.patches, tierBands: described.provenance?.tierBands, lastGameAt: described.provenance?.lastGameAt, proGames: described.provenance?.proGames },
        collection: { byPatch, clearRolesByPatch: reliable, perDayLast14: perDay, currentPatchByRegion: Object.fromEntries(Object.entries(regions).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${v} (${pct(v, currentTotal)}%)`])), currentPatchByBand: bands, currentPatchBans: num(rows7d.bans), fetchQueue: queue, trackedPlayers: tracked, pro },
        schedule: { jobsLast7d: jobs, recentTicks: tickStarts, recentIngestRuns: ingestRuns, failuresLast7d: failures },
        evidenceInRecentDrafts: {
          games: recent.length,
          note: "Effective games = patch-, rank- and rework-weighted games the engine holds. Prior weights: strength 250, lane matchup 60, pairing 60 (at the prior weight, data and prior count equally).",
          championStrength: { ...sufficiency(ev.strength, 250), distribution: buckets(ev.strength, [50, 125, 250]) },
          laneMatchups: { ...sufficiency(ev.lane, 60), distribution: buckets(ev.lane, [1, 5, 15, 30, 60]) },
          keyPairings: { ...sufficiency(ev.pair, 60), distribution: buckets(ev.pair, [1, 5, 15, 30, 60]) },
          currentPatchRows: { championRoles: num(roleRows.rows), championRolesWith50: num(roleRows.ge50), championRolesWith250: num(roleRows.ge250), laneMatchupRows: num(matchupRows.rows), laneRowsWith2: num(matchupRows.ge2), laneRowsWith10: num(matchupRows.ge10), laneRowsWith30: num(matchupRows.ge30) },
        },
        compositionTraitsAgainstOutcomes: [traitCheck("engage", 4), traitCheck("frontline", 4), traitCheck("counterEngage", 3), traitCheck("poke", 3), traitCheck("scaling", 3)],
        examples: {
          named: [describeMatchup("Gwen", "TOP", "Ornn"), describeMatchup("Ambessa", "TOP", "Jax"), describeMatchup("Riven", "TOP", "Renekton"), describeMatchup("Ahri", "MID", "Orianna"), describeMatchup("Jinx", "ADC", "Caitlyn")],
          mostPlayedLanes: commonLanes,
          mostPlayedTopJungle: topJungle,
          namedPairs: [describePair("Ornn", "TOP", "JarvanIV", "JUNGLE"), describePair("Gwen", "TOP", "Viego", "JUNGLE"), describePair("Jinx", "ADC", "Lulu", "SUPPORT")],
        },
        scouting: { drafts: num(drafts.drafts), draftsWithEnemyNames: num(drafts.with_enemies), scoutedEnemyPlayers: num(scouting.n), scoutedDrafts: num(scouting.drafts) },
        lineup: { placeholderRoles: lineup.placeholders, roleCoverage: lineup.coverage, poolSizes: Object.fromEntries(ROLES.map((r) => [r, lineup.players.find((p) => p.id === lineup.assignment[r])!.primaryPool.length])) },
        scenarios,
        heldOutCheck,
        leaveOneOut,
        inSampleCheck,
      },
    };
  },
});
