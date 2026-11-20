import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { hasPermission, type Session } from "@/server/auth/permissions";
import { cachedFor } from "@/server/observability/cache";
import { getCurrentPatch, listPatchesDesc } from "@/server/repositories/champions";
import { loadRiotAssets, loadRiotBuildData } from "@/server/riot/static/assets";
import { comparePatches, publicPatchName } from "@/domain/patch";
import { DUO_ROLES, type ChampionChoice, type Role } from "@/domain/matchup-intel/types";
import {
  EVIDENCE_FIELDS,
  MIN_GAMES,
  fewGamesWords,
  namedBy,
  fieldLine,
  laneEndLine,
  objectivesLine,
  recordCount,
  recordLine,
  scopeTier,
  type CountRow,
  type EvidenceCounts,
  type EvidenceField,
  type EvidenceLine,
  type EvidenceNames,
  type PatchWindow,
  type EvidenceScope,
  type EvidenceSection,
  type MatchupEvidence,
} from "@/domain/matchup-intel/evidence";
import { PREP_FORMAT, type PrepLane } from "@/domain/matchup-intel/prep";
import { EVIDENCE_CACHE, RIFT_QUEUES } from "./prep-store";
import { unchangedKeys } from "./digests";

/*
  MATCHUP INTEL's evidence from the team's own games (docs/MATCHUP_INTEL.md, "In your games"),
  counted in SQL over account_match_prep so only counts leave the database (a few KB a view):
  - "In your games": the viewer's own player's accounts;
  - "In the team's games": the other team members whose statistics the viewer may already see
    (view-teammate-stats, #207's levels), never a personal-use profile (players.team_member false:
    its player's and the administrators' only, and never counted for anyone else); counts only, no
    name. A viewer without the capability gets no team counts at all.
  Each count set is cached for an hour by (scope, viewer, role, champions, patches), and cleared
  when evidence rows are written (prep-store.ts).
*/

const ROLE_LANE: Record<Role, PrepLane> = { top: "TOP", jungle: "JUNGLE", mid: "MIDDLE", adc: "BOTTOM", support: "UTILITY" };
const CACHE_MS = 60 * 60_000;
/** Shorter games are remakes, as Matchups and the timeline backfill count them (MIN_LANE_GAME_SECONDS). */
const MIN_GAME_SECONDS = 300;
const queueList = sql.raw(RIFT_QUEUES.join(", "));
const rowsOf = <T,>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];

interface Filters {
  lane: PrepLane;
  champion: string;
  vs?: string;
  ally?: string;
  vs2?: string;
}

/** Who a scope counts: the viewer's own player, or the other team members (never a personal-use profile). */
function playersOf(scope: EvidenceScope, viewer: string | null): SQL {
  // The team: members now (not archived, not personal use), the viewer apart.
  return scope === "own" ? sql`ra.player_id = ${viewer}::uuid` : viewer ? sql`ra.player_id IN (SELECT id FROM players WHERE team_member AND archived_at IS NULL AND id <> ${viewer}::uuid)` : sql`ra.player_id IN (SELECT id FROM players WHERE team_member AND archived_at IS NULL)`;
}

/** One count set: games, each field's values, objectives and lane ends, by patch and queue (rows of counts only). */
async function countEvidence(db: Db, scope: EvidenceScope, viewer: string | null, f: Filters, patches: readonly string[]): Promise<EvidenceCounts & { position: number }> {
  const slot = (key: "vs" | "ally" | "vs2") => (f[key] ? sql` AND p.prep->>${key} = ${f[key]}` : sql``);
  const rows = rowsOf<{ dim: string; patch: string; queue: number | string; value: string | null; n: number | string; won: number | string; total: number | string }>(
    await db.execute(sql`
      WITH g AS MATERIALIZED (
        SELECT am.patch, am.queue_id AS queue, am.win, p.prep
        FROM account_match_prep p
        JOIN account_matches am ON am.account_id = p.account_id AND am.match_id = p.match_id
        JOIN riot_accounts ra ON ra.id = am.account_id AND ra.owner_type = 'player'
        WHERE ${playersOf(scope, viewer)} AND p.format = ${PREP_FORMAT}
          AND am.champion_id = ${f.champion} AND p.prep->>'lane' = ${f.lane}
          AND am.patch IN (${sql.join(patches.map((x) => sql`${x}`), sql`, `)}) AND am.queue_id IN (${queueList})
          -- A game counts as Matchups counts one: a result known, and not a remake (MIN_LANE_GAME_SECONDS, 5 minutes).
          AND am.win IS NOT NULL AND am.game_duration >= ${MIN_GAME_SECONDS}
          ${slot("vs")}${slot("ally")}${slot("vs2")}
      )
      SELECT 'games' AS dim, patch, queue, NULL AS value, count(*) AS n, count(*) FILTER (WHERE win) AS won, 0 AS total FROM g GROUP BY patch, queue
      UNION ALL
      SELECT x.dim, g.patch, g.queue, x.value, count(*), 0, 0
        FROM g CROSS JOIN LATERAL (VALUES ('runes', g.prep->>'runes'), ('spells', g.prep->>'spells'), ('start', g.prep->>'start'), ('back', g.prep->>'back'), ('items', g.prep->>'items'), ('skills', g.prep->>'skills'), ('max', g.prep->>'max'), ('rule', g.prep->>'rule')) AS x(dim, value)
        WHERE x.value IS NOT NULL GROUP BY x.dim, g.patch, g.queue, x.value
      UNION ALL
      SELECT 'obj', patch, queue, NULL, count(*), sum((prep->'obj'->>'taken')::int), sum((prep->'obj'->>'total')::int) FROM g WHERE prep ? 'obj' GROUP BY patch, queue
      UNION ALL
      SELECT 'end', patch, queue, prep->>'end', count(*), 0, 0 FROM g WHERE prep ? 'end' GROUP BY patch, queue, prep->>'end'`),
  );
  const out: EvidenceCounts & { position: number } = { games: [], fields: {}, objectives: [], ends: [], position: 0 };
  for (const r of rows) {
    const n = Number(r.n);
    const queue = Number(r.queue);
    if (r.dim === "games") out.games.push({ patch: r.patch, queue, n, won: Number(r.won) });
    else if (r.dim === "obj") out.objectives.push({ patch: r.patch, queue, games: n, taken: Number(r.won), total: Number(r.total) });
    else if (r.dim === "end") for (let i = 0; i < n; i++) out.ends.push({ patch: r.patch, queue, end: Number(r.value) });
    else if (r.dim === "rule") {
      if (r.value === "position") out.position += n;
    } else if ((EVIDENCE_FIELDS as readonly string[]).includes(r.dim) && r.value !== null) {
      const field = r.dim as EvidenceField;
      (out.fields[field] ??= [] as CountRow[]).push({ patch: r.patch, queue, value: r.value, n });
    }
  }
  return out;
}

const keyOf = (parts: unknown) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

function cachedCounts(db: Db, scope: EvidenceScope, viewer: string | null, f: Filters, patches: readonly string[]) {
  return cachedFor(`${EVIDENCE_CACHE}:${keyOf([scope, viewer, f, patches])}`, CACHE_MS, () => countEvidence(db, scope, viewer, f, patches), db);
}

/** The patch before the current one among those the app has seen, or null. */
function previousOf(current: string, known: readonly string[]): string | null {
  const older = known.filter((p) => comparePatches(p, current) < 0).sort((a, b) => comparePatches(b, a));
  return older[0] ?? null;
}

export interface EvidenceInput {
  role: Role;
  you: ChampionChoice | null;
  ally: ChampionChoice | null;
  enemy: ChampionChoice | null;
  enemy2: ChampionChoice | null;
}

/**
 * The evidence for the page's slots: null until your champion is chosen (every line is about it).
 * Lines count only games matching every chosen slot; `ignored` names the empty ones.
 */
export async function loadMatchupEvidence(db: Db, session: Session | null, input: EvidenceInput, champions: readonly ChampionChoice[]): Promise<MatchupEvidence | null> {
  const { role, you, ally, enemy, enemy2 } = input;
  if (!you || !session) return null;
  const duo = DUO_ROLES.has(role);
  const current = await getCurrentPatch(db);
  if (!current) return { patch: null, ignored: [], sections: [] };
  const known = await cachedFor("patch:known", 60_000, () => listPatchesDesc(db), db);
  const previous = previousOf(current.patch, known);
  const patches = previous ? [current.patch, previous] : [current.patch];
  const filters: Filters = { lane: ROLE_LANE[role], champion: you.id, ...(enemy ? { vs: enemy.id } : {}), ...(duo && ally ? { ally: ally.id } : {}), ...(duo && enemy2 ? { vs2: enemy2.id } : {}) };
  // The empty slots by what they hold, never "your" (the evidence's words: EVIDENCE_REFUSED_WORDS).
  const mine = role === "support" ? "support" : "ADC";
  const partner = role === "support" ? "ADC" : "support";
  const slotName = { enemy: duo ? `the enemy ${mine}` : "the enemy", ally: `the allied ${partner}`, enemy2: `the enemy ${partner}` } as const;
  const ignored = (duo ? (["enemy", "ally", "enemy2"] as const) : (["enemy"] as const)).filter((s) => !input[s]).map((s) => slotName[s]);
  const chosenIds = [you.id, ally?.id, enemy?.id, enemy2?.id].filter((x): x is string => !!x);

  // The per-version diff, read once for everything the lines may name.
  const [assets, build] = await Promise.all([loadRiotAssets(db).catch(() => null), loadRiotBuildData(db).catch(() => null)]);
  const byId = new Map(champions.map((c) => [c.id, c.name]));
  const names: EvidenceNames = {
    champion: (id) => byId.get(id) ?? id,
    item: (id) => assets?.items[id] ?? null,
    spell: (key) => assets?.spells[key]?.name ?? null,
    rune: (id) => assets?.runes[id]?.name ?? null,
    // Summoner spells' base cooldowns, as the static sync stored them from Data Dragon (nothing said until it has).
    // Only from format 3, which keeps a spell with charges (Smite) apart: before it, Smite's array, the wait between casts, would read as its cooldown.
    ...(build?.spellCooldowns && (build.format ?? 0) >= 3 ? { spellCooldown: (key: string) => build.spellCooldowns[key] ?? null, spellCharges: (key: string) => build.spellCharges?.[key] ?? null } : {}),
  };

  const what = [you.name, duo && ally ? `with ${ally.name}` : null, enemy ? `against ${enemy.name}` : null, duo && enemy2 ? `${enemy ? "and" : "against"} ${enemy2.name}` : null].filter(Boolean).join(" ");
  const sections: EvidenceSection[] = [];
  for (const scope of ["own", "team"] as const) {
    if (scope === "own" && !session.playerId) {
      sections.push({ scope, tier: null, n: 0, lines: [], empty: "In your games: this account has no player profile, so it has no games of its own.", positionNote: null });
      continue;
    }
    if (scope === "team" && !hasPermission(session, "view-teammate-stats")) {
      sections.push({ scope, tier: null, n: 0, lines: [], empty: "In the team's games: teammates' statistics are not part of this account's access.", positionNote: null });
      continue;
    }
    const counts = await cachedCounts(db, scope, session.playerId, filters, patches);
    const window: PatchWindow = { current: current.patch, previous, unchanged: () => false };
    const unchanged = previous ? await unchangedSets(db, current.patch, previous, counts, chosenIds) : null;
    if (unchanged) window.unchanged = unchanged;
    const lines: EvidenceLine[] = [];
    const record = recordLine("record", enemy ? `${you.name} against ${enemy.name}${duo && enemy2 ? ` and ${enemy2.name}` : ""}${duo && ally ? `, with ${ally.name}` : ""}` : `${you.name} as ${roleName(role)}${duo && ally ? `, with ${ally.name}` : ""}`, counts, window, chosenIds);
    if (record) lines.push(record);
    for (const field of EVIDENCE_FIELDS) {
      const line = fieldLine(field, counts, window, chosenIds, names);
      if (line) lines.push(line);
    }
    if (role === "jungle" && enemy) {
      const obj = objectivesLine(counts, window, chosenIds, names);
      if (obj) lines.push(obj);
    }
    // The bot lane, pairwise: the record with the ally, and against each enemy, each counted on its own.
    if (duo) {
      const pair = async (key: string, label: string, f: Filters, champs: string[]) => {
        const c = await cachedCounts(db, scope, session.playerId, f, patches);
        return recordLine(key, label, c, window, champs);
      };
      const base: Filters = { lane: filters.lane, champion: you.id };
      type Pair = { key: string; label: string; f: Filters; c: string };
      const chosen: Pair[] = [];
      if (ally) chosen.push({ key: "with-ally", label: `With ${ally.name}`, f: { ...base, ally: ally.id }, c: ally.id });
      if (enemy) chosen.push({ key: "vs-enemy", label: `Against ${enemy.name}`, f: { ...base, vs: enemy.id }, c: enemy.id });
      if (enemy2) chosen.push({ key: "vs-enemy2", label: `Against ${enemy2.name}`, f: { ...base, vs2: enemy2.id }, c: enemy2.id });
      // With more than one slot chosen the main record is the combination; each pair is added beside it.
      if (chosen.length > 1) {
        let pairs = 0;
        for (const p of chosen) {
          const line = await pair(p.key, p.label, p.f, [you.id, p.c]);
          if (!line) continue;
          lines.push(line);
          pairs += 1;
        }
        // The four together only at n ≥ 3; under it, said beside the pairs that are counted (with none, the section's own line says it).
        if (ally && enemy && enemy2 && !record && pairs) lines.push({ key: "four", label: "This 2v2", values: `too few games: fewer than ${MIN_GAMES} on patch ${publicPatchName(current.patch)}`, sample: "" });
      }
    }
    lines.push(laneEndLine(counts, window, chosenIds, role === "jungle"));
    // The tier's n is the record's: the games every chosen slot matches, on the patches it counts.
    const { n, patches: countedOn } = recordCount(counts, window, chosenIds);
    const counted = lines.filter((l) => l.key !== "end");
    sections.push({
      scope,
      tier: scopeTier(scope, n),
      n,
      lines: counted.length ? lines : [],
      empty: counted.length ? null : fewGamesWords(scope, n, what, countedOn),
      positionNote: counts.position ? "Some of these games were stored before Riot's two position readings were kept: their lane opponent is by Riot's position." : null,
    });
  }
  return { patch: publicPatchName(current.patch), ignored, sections };
}

/** The per-version diff for everything a count set may name, read in one query; a function the templates ask. */
async function unchangedSets(db: Db, current: string, previous: string, counts: EvidenceCounts, champions: readonly string[]): Promise<PatchWindow["unchanged"]> {
  const named: Array<{ kind: "champion" | "item" | "rune"; key: string }> = champions.map((c) => ({ kind: "champion" as const, key: c }));
  for (const [field, rows] of Object.entries(counts.fields)) for (const r of rows ?? []) named.push(...namedBy(field as EvidenceField, r.value));
  // Cached with the counts (cleared with them, and when a patch's digests are recorded): a repeat view reads nothing (R7 review B3).
  const keys = [...new Set(named.map((n) => `${n.kind}:${n.key}`))].sort();
  const same = new Set(await cachedFor(`${EVIDENCE_CACHE}:diff:${keyOf([current, previous, keys])}`, CACHE_MS, async () => [...(await unchangedKeys(db, current, previous, named))], db));
  return (list) => list.length > 0 && list.every((n) => same.has(`${n.kind}:${n.key}`));
}

const roleName = (role: Role) => ({ top: "Top", jungle: "Jungle", mid: "Mid", adc: "ADC", support: "Support" })[role];
