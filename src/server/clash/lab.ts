import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import type { ErasureFilter } from "@/server/privacy/ledger";
import { roundMastery, type MasteryRounding } from "@/domain/clash-scout/mastery-input";
import type { MasterySnapshot, Outcome } from "@/domain/clash-scout/mastery-match";
import { applyVariant, gradeOf, type Grade, type LabInput, type VariantSpec } from "@/domain/clash-scout/lab";
import type { CandidateRiot } from "./candidate-riot";
import { accountRef, identifyAgainstPool, identifyByName, type IdentifiedPlayer, type PoolAccount } from "./identify";
import { seal, unseal } from "./seal";

/*
  THE TESTING LAB's runs, on the same engine as Clash Scout (identify.ts):

  - A manual test runs the real pipeline: discovery by name, Riot's figures, the rules. Nobody
    knows the right answers, so nothing is called correct.
  - A blind test picks accounts UNIIVERSE already knows (players of the members' recorded games on
    the server, never members), reads their Riot ID and mastery now, and builds what a scouting
    screen would show: the name without its tag, the five champions with the most points (rounded
    as asked), the total mastery score. The answers are sealed (seal.ts) and travel with the test;
    the matching code never receives them, and only `grade` opens them, after the run.
    Two conditions, always reported apart:
      A  real discovery: exactly the production pipeline; an account it cannot find is a
         discovery failure;
      B  controlled: every player against one pool of known accounts (the test's accounts and
         others who played the same champions with or against the team), by mastery alone. It
         shows whether the rules pick the right account when it is there, and nothing about
         discovery.
  - An outdated-data test runs variants of a test (older screens, a champion entering the top five,
    another order, rounding, missing figures, a renamed player, similar accounts) and compares them
    with the test as entered.

  Nothing is written to the database. Bounded: a blind test reads its accounts in at most 12
  attempts and adds at most 8 others to the pool (two Riot questions an account, kept half an hour).
*/

const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
const DAY = 86_400_000;

export interface LabRunPlayer extends IdentifiedPlayer {
  /** Blind tests only, after grading. */
  grade?: Grade;
  truth?: { label: string; rank: number | null };
}

export interface LabRunSummary {
  players: number;
  candidates: number;
  outcomes: Partial<Record<Outcome, number>>;
  /** Blind tests only. */
  graded?: { correct: number; incorrect: number; ambiguous: number; notIdentified: number; notDiscovered: number; notEnough: number; truthDiscovered: number; topRanked: number };
  avgMs: number;
}

export interface LabRun {
  condition: "discovery" | "controlled";
  players: LabRunPlayer[];
  summary: LabRunSummary;
  requests: { accounts: number; mastery: number };
  standIn: boolean;
}

function summarise(players: LabRunPlayer[]): LabRunSummary {
  const outcomes: Partial<Record<Outcome, number>> = {};
  for (const p of players) outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1;
  const graded = players.some((p) => p.grade)
    ? {
        correct: players.filter((p) => p.grade === "correct").length,
        incorrect: players.filter((p) => p.grade === "incorrect").length,
        ambiguous: players.filter((p) => p.grade === "ambiguous").length,
        notIdentified: players.filter((p) => p.grade === "not-identified").length,
        notDiscovered: players.filter((p) => p.grade === "not-discovered").length,
        notEnough: players.filter((p) => p.grade === "not-enough").length,
        truthDiscovered: players.filter((p) => p.truth?.rank !== null && p.truth?.rank !== undefined).length,
        topRanked: players.filter((p) => p.truth?.rank === 1).length,
      }
    : undefined;
  return { players: players.length, candidates: players.reduce((n, p) => n + p.candidates.length, 0), outcomes, graded, avgMs: players.length ? players.reduce((n, p) => n + p.ms, 0) / players.length : 0 };
}

export interface LabContext {
  db: Db;
  teamId: string;
  platform: string;
  riot: CandidateRiot;
  championName: (id: string) => string;
  erased: ErasureFilter;
  now: number;
}

/** A manual test: the real pipeline, no answers. */
export async function runManualTest(ctx: LabContext, inputs: LabInput[]): Promise<LabRun> {
  const before = ctx.riot.counts();
  const players = await identifyByName(ctx.db, ctx.teamId, ctx.platform, inputs, ctx.riot, { championName: ctx.championName, erased: ctx.erased, now: ctx.now });
  const after = ctx.riot.counts();
  return { condition: "discovery", players, summary: summarise(players), requests: { accounts: after.accounts - before.accounts, mastery: after.mastery - before.mastery }, standIn: ctx.riot.standIn };
}

/* ---------- Blind tests ---------- */

interface Truth {
  slot: number;
  puuid: string;
  riotId: string;
  /** Its champion after the five shown (for "a champion entered the top five"). */
  next: { championId: string; points: number } | null;
}

interface AnswerKey {
  v: 1;
  platform: string;
  createdAt: number;
  targets: Truth[];
  /** Other known accounts of the controlled pool. */
  pool: string[];
}

const KEY_PURPOSE = "clash-lab-answers";

export interface BlindTestOptions {
  players: number;
  rounding: MasteryRounding;
  includeTotal: boolean;
}

export interface BlindTest {
  inputs: LabInput[];
  /** The sealed answers: opaque to the browser and to the matching code. */
  key: string;
  generatedAt: number;
  /** Accounts the generator looked at and set aside (gone, no mastery, too few champions). */
  skipped: number;
  standIn: boolean;
}

/** Known accounts of the members' recorded games on this server (never a member), in a random order. */
async function knownAccounts(db: Db, teamId: string, platform: string, seed: string, limit: number) {
  const result = await db.execute(sql`
    SELECT x->>'puuid' AS puuid, (array_agg(x->>'name' ORDER BY d.game_creation DESC))[1] AS name, jsonb_agg(DISTINCT x->>'championId') AS champions
    FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) AS p(x)
    WHERE d.platform = ${platform} AND x->>'puuid' IS NOT NULL AND x->>'name' LIKE '%#%'
      AND d.match_id IN (SELECT am.match_id FROM account_matches am JOIN riot_accounts ra ON ra.id = am.account_id JOIN players pl ON pl.id = ra.player_id WHERE pl.team_id = ${teamId})
      AND NOT EXISTS (SELECT 1 FROM riot_accounts own WHERE own.owner_type = 'player' AND own.puuid = x->>'puuid')
    GROUP BY x->>'puuid'
    ORDER BY md5(x->>'puuid' || ${seed})
    LIMIT ${limit}`);
  return rowsOf<{ puuid: string; name: string; champions: Array<string | null> | null }>(result);
}

/** Builds a blind test: up to five known accounts as a scouting screen would show them, answers sealed. */
export async function generateBlindTest(ctx: LabContext, options: BlindTestOptions): Promise<BlindTest> {
  const seed = randomBytes(6).toString("hex");
  const wanted = Math.max(1, Math.min(5, options.players));
  const sample = await knownAccounts(ctx.db, ctx.teamId, ctx.platform, seed, 40);
  const targets: Truth[] = [];
  const inputs: LabInput[] = [];
  let skipped = 0, attempts = 0;
  for (const row of sample) {
    if (targets.length >= wanted || attempts >= 12) break;
    if (ctx.erased.puuid(row.puuid)) continue;
    attempts++;
    const riotId = await ctx.riot.riotIdNow(ctx.platform, row.puuid);
    const mastery = riotId && !ctx.erased.riotId(riotId) ? await ctx.riot.mastery(ctx.platform, row.puuid) : null;
    if (!riotId || !mastery?.ok || mastery.snapshot.champions.length < 3) {
      skipped++;
      continue;
    }
    const top = mastery.snapshot.champions.slice(0, 5);
    const slot = targets.length;
    targets.push({ slot, puuid: row.puuid, riotId, next: mastery.snapshot.champions[5] ?? null });
    inputs.push({
      slot,
      name: riotId.split("#")[0]!,
      shown: {
        champions: top.map((c) => {
          const r = roundMastery(c.points, options.rounding);
          return { championId: c.championId, points: r.points, precision: r.precision };
        }),
        totalScore: options.includeTotal ? mastery.snapshot.totalScore : null,
        capturedAt: ctx.now,
      },
    });
  }
  // The controlled pool: the test's accounts and up to eight others who played the same champions.
  const chosen = new Set(targets.map((t) => t.puuid));
  const shownChampions = new Set(inputs.flatMap((i) => i.shown.champions.map((c) => c.championId)));
  const others = sample
    .filter((r) => !chosen.has(r.puuid) && !ctx.erased.puuid(r.puuid))
    .map((r) => ({ puuid: r.puuid, overlap: (r.champions ?? []).filter((c) => c && shownChampions.has(c)).length }))
    .filter((r) => r.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 8)
    .map((r) => r.puuid);
  const key: AnswerKey = { v: 1, platform: ctx.platform, createdAt: ctx.now, targets, pool: others };
  return { inputs, key: seal(KEY_PURPOSE, key), generatedAt: ctx.now, skipped, standIn: ctx.riot.standIn };
}

function openKey(token: string, platform: string): AnswerKey | null {
  const key = unseal<AnswerKey>(KEY_PURPOSE, token);
  if (!key || key.v !== 1 || key.platform !== platform || !Array.isArray(key.targets)) return null;
  // A test is good for a day: its accounts' figures are read again, and older answers would not match them.
  return Date.now() - key.createdAt > DAY ? null : key;
}

/** Opens the answers after a run and marks each player's result. The only code that reads them. */
function grade(players: IdentifiedPlayer[], key: AnswerKey, label: (puuid: string) => string): LabRunPlayer[] {
  return players.map((p) => {
    const truth = key.targets.find((t) => t.slot === p.slot);
    if (!truth) return p;
    const ref = accountRef(truth.puuid);
    const index = p.candidates.findIndex((c) => c.ref === ref);
    const rank = index < 0 ? null : index + 1;
    return { ...p, grade: gradeOf(p.outcome, p.candidates[0]?.ref === ref, rank), truth: { label: label(truth.puuid), rank } };
  });
}

async function poolAccounts(ctx: LabContext, puuids: string[], decoys?: { inputs: LabInput[]; count: number; spread: number }): Promise<PoolAccount[]> {
  const pool: PoolAccount[] = [];
  for (const puuid of puuids) {
    if (ctx.erased.puuid(puuid)) continue;
    const [riotId, mastery] = await Promise.all([ctx.riot.riotIdNow(ctx.platform, puuid), ctx.riot.mastery(ctx.platform, puuid)]);
    pool.push({ ref: accountRef(puuid), label: riotId ?? "An account Riot no longer names", riotId, snapshot: mastery.ok ? mastery.snapshot : null });
  }
  if (decoys) {
    // Made-up accounts with the same champions and nearby points: can the rules tell them apart?
    let n = 0;
    for (const input of decoys.inputs)
      for (let k = 0; k < decoys.count; k++) {
        const sign = k % 2 ? -1 : 1;
        const snapshot: MasterySnapshot = {
          champions: input.shown.champions.filter((c) => c.points !== null).map((c, i) => ({ championId: c.championId, points: Math.max(1, Math.round(c.points! * (1 + (sign * decoys.spread * (1 + ((i + k) % 3))) / 300))) })),
          coverage: "top",
          totalScore: null,
          capturedAt: ctx.now,
          label: "Synthetic decoy",
        };
        pool.push({ ref: `decoy-${++n}`, label: `Synthetic decoy ${n}`, riotId: null, snapshot, synthetic: true });
      }
  }
  return pool;
}

export interface BlindRun {
  discovery: LabRun;
  controlled: LabRun;
}

/** Runs a blind test under both conditions and grades each apart. */
export async function runBlindTest(ctx: LabContext, inputs: LabInput[], token: string, variant?: VariantSpec): Promise<BlindRun | null> {
  const key = openKey(token, ctx.platform);
  if (!key) return null;
  const labels = new Map(key.targets.map((t) => [t.puuid, t.riotId]));
  const label = (puuid: string) => labels.get(puuid) ?? "the test's account";

  // A: the production pipeline, given only what a screen shows.
  const a0 = ctx.riot.counts();
  const discovered = await identifyByName(ctx.db, ctx.teamId, ctx.platform, inputs, ctx.riot, { championName: ctx.championName, erased: ctx.erased, now: ctx.now });
  const a1 = ctx.riot.counts();
  const discovery = grade(discovered, key, label);

  // B: the same inputs against the pool, by mastery alone.
  const pool = await poolAccounts(ctx, [...key.targets.map((t) => t.puuid), ...key.pool], variant?.kind === "decoys" ? { inputs, count: Math.max(1, Math.min(4, variant.count ?? 2)), spread: Math.max(1, Math.min(50, variant.spread ?? 8)) } : undefined);
  const a2 = ctx.riot.counts();
  const controlled = grade(identifyAgainstPool(inputs, shuffled(pool, token), ctx.championName), key, label);

  return {
    discovery: { condition: "discovery", players: discovery, summary: summarise(discovery), requests: { accounts: a1.accounts - a0.accounts, mastery: a1.mastery - a0.mastery }, standIn: ctx.riot.standIn },
    controlled: { condition: "controlled", players: controlled, summary: summarise(controlled), requests: { accounts: a2.accounts - a1.accounts, mastery: a2.mastery - a1.mastery }, standIn: ctx.riot.standIn },
  };
}

/** The pool in an order that says nothing about which account is right (the same order for the same test). */
function shuffled<T extends { ref: string }>(list: T[], salt: string): T[] {
  const weight = (s: string) => {
    let h = 2166136261;
    for (const ch of `${salt}:${s}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  return [...list].sort((a, b) => weight(a.ref) - weight(b.ref));
}

/* ---------- Outdated-data tests ---------- */

export interface VariantRun {
  variant: VariantSpec;
  inputs: LabInput[];
  discovery: LabRun;
  controlled: LabRun | null;
}

/** Runs each variant of a test (manual or blind) through the same engine. */
export async function runVariants(ctx: LabContext, inputs: LabInput[], variants: VariantSpec[], token: string | null): Promise<VariantRun[] | null> {
  const key = token ? openKey(token, ctx.platform) : null;
  if (token && !key) return null;
  const out: VariantRun[] = [];
  for (const variant of variants.slice(0, 9)) {
    if (variant.kind === "decoys" && !key) continue; // a pool exists only in a blind test
    const changed = inputs.map((i) => applyVariant(i, variant, ctx.now, key?.targets.find((t) => t.slot === i.slot)?.next ?? null));
    if (key) {
      const run = await runBlindTest(ctx, changed, token!, variant);
      if (!run) return null;
      out.push({ variant, inputs: changed, discovery: run.discovery, controlled: run.controlled });
    } else {
      out.push({ variant, inputs: changed, discovery: await runManualTest(ctx, changed), controlled: null });
    }
  }
  return out;
}

