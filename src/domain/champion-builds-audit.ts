import { LANE_ORDER } from "@/domain/match-analysis";
import { publicPatchName } from "@/domain/patch";
import { RIOT_POSITION_TO_ROLE, type Role } from "@/domain/roles";
import {
  BUILD_QUEUE_IDS,
  BUILD_QUEUE_KEYS,
  BUILD_QUEUES,
  MIN_CHOICE_GAMES,
  MIN_CHOICE_SHARE,
  MIN_PART_GAMES,
  MIN_PERFORMER_GAMES,
  MIN_PERFORMER_SHARE,
  MIN_SECTION_GAMES,
  PART_FAMILY,
  PERFORMER_MARGIN,
  PERFORMER_MAX_ONE_PLAYER,
  PERFORMER_Z,
  buildQueueKey,
  differenceInterval,
  laneWindow,
  validBuildValue,
  wilsonInterval,
  type BuildCountRow,
  type BuildLane,
  type BuildPart,
  type BuildQueueKey,
  type ChampionBuildsViews,
  type PatchWindow,
} from "@/domain/champion-builds";

/*
  The builds audit (server/jobs/builds-audit; docs/LIVE_VALIDATION.md, "The builds audit"): on
  production's own counts, which champions have builds on the patch window, and whether what the
  page shows for them keeps every rule. The rules are re-derived here from the raw counts, written
  out again rather than by calling the page's choosePart, so a mistake in one shows against the
  other:
  - R1: each champion-role-queue with MIN_SECTION_GAMES games on its window (the candidates) is shown;
  - R2: a role's games, its window (the previous patch only where the current has too few) and its
    current games;
  - R3: "few" exactly under MIN_PART_GAMES, every part within the role's games, items and skills
    within the games with a timeline;
  - R4: "Most common": the reliable family (MIN_CHOICE_GAMES games and MIN_CHOICE_SHARE) with the
    most games;
  - R5, R6: "Highest win rate" exactly where the rule (D6) finds one, and that one;
  - R7: "varied" exactly where no family is reliable;
  - R8: every count carries one of the four queues, and each queue's view reads only its own (never
    pooled), Ranked Solo/Duo the default;
  - R9: every counted value has its kind's form and is under 60 characters, so no identifier can
    stand in one; no player's most games above the value's own;
  - R10: the full build's later items each reliable.
  Violations are labels only (c1/MID/solo/core:performer), never a champion's name: the job's answer
  is printed in public logs.
*/

/** One champion's games in one lane, queue and patch (the candidates statement's rows). */
export interface CandidateCount {
  champion: string;
  lane: BuildLane;
  queue: number;
  patch: string;
  n: number;
}

/** A champion-role-queue with builds on its window: what the page must show. */
export interface AuditCandidate {
  champion: string;
  lane: BuildLane;
  role: Role;
  queue: BuildQueueKey;
  /** Its games on its window. */
  games: number;
  /** The window's patches, internal names, newest first. */
  window: string[];
}

/** The champion-role-queues with enough games on their window, most games first (ties: the champion, the lane, the queue). */
export function buildCandidates(rows: readonly CandidateCount[], window: PatchWindow): AuditCandidate[] {
  const by = new Map<string, { champion: string; lane: BuildLane; queue: BuildQueueKey; current: number; previous: number }>();
  for (const r of rows) {
    const queue = buildQueueKey(r.queue);
    if (!queue) continue;
    const key = `${r.champion}|${r.lane}|${queue}`;
    const c = by.get(key) ?? { champion: r.champion, lane: r.lane, queue, current: 0, previous: 0 };
    if (r.patch === window.current) c.current += r.n;
    else if (r.patch === window.previous) c.previous += r.n;
    by.set(key, c);
  }
  const out: AuditCandidate[] = [];
  for (const c of by.values()) {
    const patches = laneWindow(c.current, c.previous, window);
    if (!patches) continue;
    out.push({ champion: c.champion, lane: c.lane, role: RIOT_POSITION_TO_ROLE[c.lane]!, queue: c.queue, games: c.current + (patches.length > 1 ? c.previous : 0), window: patches });
  }
  return out.sort((a, b) => b.games - a.games || (a.champion < b.champion ? -1 : a.champion > b.champion ? 1 : 0) || LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane) || BUILD_QUEUE_KEYS.indexOf(a.queue) - BUILD_QUEUE_KEYS.indexOf(b.queue));
}

/**
 * The champions audited: the `top` with the most games in one role and queue, then up to `rotating`
 * more taken in turn by the day's number (`day`: days since 1970, UTC), so every champion with builds
 * is audited within a few days. Distinct, in that order.
 */
export function auditedChampions(candidates: readonly AuditCandidate[], day: number, top = 3, rotating = 3): string[] {
  const order = [...new Set(candidates.map((c) => c.champion))];
  const first = order.slice(0, top);
  const rest = order.slice(top);
  const turn = rest.length ? Array.from({ length: Math.min(rotating, rest.length) }, (_, i) => rest[(((day * rotating + i) % rest.length) + rest.length) % rest.length]!) : [];
  return [...new Set([...first, ...turn])];
}

/**
 * The two champions the Production check opens (the builds facts): those with the most games in one
 * role of Ranked Solo/Duo, the page's default; where fewer than two have builds there, the others'
 * queues fill in, each with the queue its builds are in. Distinct champions.
 */
export function probeChampions(candidates: readonly AuditCandidate[], max = 2): Array<{ champion: string; queue: BuildQueueKey }> {
  const out: Array<{ champion: string; queue: BuildQueueKey }> = [];
  const ordered = [...candidates.filter((c) => c.queue === "solo"), ...candidates.filter((c) => c.queue !== "solo")];
  for (const c of ordered) {
    if (out.length >= max) break;
    if (!out.some((o) => o.champion === c.champion)) out.push({ champion: c.champion, queue: c.queue });
  }
  return out;
}

const LANE_OF: Record<Role, BuildLane> = Object.fromEntries(Object.entries(RIOT_POSITION_TO_ROLE).filter(([lane]) => (LANE_ORDER as readonly string[]).includes(lane)).map(([lane, role]) => [role, lane])) as Record<Role, BuildLane>;

/** A value's games and wins, and the most any one player had with it (team counts: every game weighs 1). */
interface Count {
  n: number;
  w: number;
  top: number;
}

/** The raw counts of one queue, lane and window, value → totals, per dim. */
function countsOf(rows: readonly BuildCountRow[], queue: number, lane: BuildLane, patches: readonly string[]): Map<string, Map<string, Count>> {
  const out = new Map<string, Map<string, Count>>();
  for (const r of rows) {
    if (r.queue !== queue || r.lane !== lane || !patches.includes(r.patch)) continue;
    const dim = out.get(r.dim) ?? new Map<string, Count>();
    const c = dim.get(r.value) ?? { n: 0, w: 0, top: 0 };
    c.n += r.n;
    c.w += r.w;
    c.top += r.top;
    dim.set(r.value, c);
    out.set(r.dim, dim);
  }
  return out;
}

const sumN = (m: Map<string, Count> | undefined) => [...(m?.values() ?? [])].reduce((s, c) => s + c.n, 0);

/** One part re-derived from its raw counts: its state, total, most common family and the highest win rate's (or null). */
export function rederivePart(values: Map<string, Count> | undefined, keyOf: (v: string) => string | null): { state: "shown" | "few" | "varied"; total: number; standard: string | null; standardGames: number; performer: string | null } {
  const fam = new Map<string, Count>();
  let total = 0;
  for (const [v, c] of values ?? []) {
    const k = keyOf(v);
    if (k === null) continue;
    total += c.n;
    const f = fam.get(k) ?? { n: 0, w: 0, top: 0 };
    f.n += c.n;
    f.w += c.w;
    f.top += c.top;
    fam.set(k, f);
  }
  if (total < MIN_PART_GAMES) return { state: "few", total, standard: null, standardGames: 0, performer: null };
  const low = (f: Count) => wilsonInterval(f.w, f.n)!.low;
  const reliable = [...fam.entries()].filter(([, f]) => f.n >= MIN_CHOICE_GAMES && f.n / total >= MIN_CHOICE_SHARE);
  if (!reliable.length) return { state: "varied", total, standard: null, standardGames: 0, performer: null };
  reliable.sort(([ka, a], [kb, b]) => b.n - a.n || low(b) - low(a) || (ka < kb ? -1 : ka > kb ? 1 : 0));
  const [stdKey, std] = reliable[0]!;
  const others = reliable.slice(1).filter(([, f]) => f.n >= MIN_PERFORMER_GAMES && f.n / total >= MIN_PERFORMER_SHARE);
  others.sort(([ka, a], [kb, b]) => low(b) - low(a) || b.n - a.n || (ka < kb ? -1 : 1));
  const best = others[0];
  let performer: string | null = null;
  if (best) {
    const [k, f] = best;
    const d = differenceInterval({ wins: f.w, games: f.n }, { wins: std.w, games: std.n }, PERFORMER_Z);
    if (d && d.low > 0 && f.w / f.n - std.w / std.n >= PERFORMER_MARGIN && f.top <= f.n * PERFORMER_MAX_ONE_PLAYER) performer = k;
  }
  return { state: "shown", total, standard: stdKey, standardGames: std.n, performer };
}

const PARTS = ["runes", "shards", "spells", "skills", "start", "boots", "core"] as const;
/** The parts counted from games with the player's timeline. */
const TIMELINE_PARTS = new Set(["skills", "start", "boots", "core"]);

export interface ChampionAudit {
  violations: string[];
  roles: number;
  parts: { shown: number; few: number; varied: number };
  performers: number;
  widenedRoles: number;
  /** Games per queue id on the window, every role (counts only). */
  queues: Record<string, number>;
}

/**
 * Audits one champion's views against its raw counts and its candidates (`label`: an anonymous
 * label, "c1"). Pure: the job hands it what the page itself would read.
 */
export function auditChampion(label: string, rows: readonly BuildCountRow[], window: PatchWindow, views: Extract<ChampionBuildsViews, { status: "counted" }>, candidates: readonly AuditCandidate[]): ChampionAudit {
  const violations: string[] = [];
  const bad = (where: string, what: string) => violations.push(`${label}/${where}:${what}`);
  const out: ChampionAudit = { violations, roles: 0, parts: { shown: 0, few: 0, varied: 0 }, performers: 0, widenedRoles: 0, queues: Object.fromEntries(BUILD_QUEUES.map((q) => [String(q), 0])) };

  // R8, R9: every row one of the four queues, every value of its kind's form, no player's count above the value's.
  for (const r of rows) {
    if (!(BUILD_QUEUES as readonly number[]).includes(r.queue)) bad("rows", "queue");
    if (!validBuildValue(r.dim, r.value)) bad(`rows/${r.dim}`, "value-form");
    if (r.top > r.n || r.top < 0) bad(`rows/${r.dim}`, "top");
    if (r.dim === "games" && (r.patch === window.current || r.patch === window.previous)) out.queues[String(r.queue)] = (out.queues[String(r.queue)] ?? 0) + r.n;
  }
  if (BUILD_QUEUE_KEYS[0] !== "solo") bad("views", "default-queue");

  for (const queue of BUILD_QUEUE_KEYS) {
    const view = views.queues[queue];
    const id = BUILD_QUEUE_IDS[queue];
    if (view.queue !== queue || view.source !== "team") bad(queue, "view-queue");
    // R1: each candidate of this queue is shown, in its role, with its games.
    for (const c of candidates.filter((x) => x.queue === queue)) {
      if (view.status !== "shown" || !view.builds[c.role]) bad(`${c.role}/${queue}`, "not-shown");
      else if (Math.round(view.builds[c.role]!.games) !== c.games) bad(`${c.role}/${queue}`, "games");
    }
    if (view.status !== "shown") continue;
    for (const { role } of view.roles) {
      const b = view.builds[role];
      const where = `${role}/${queue}`;
      if (!b) {
        bad(where, "role-missing");
        continue;
      }
      out.roles += 1;
      if (b.widened) out.widenedRoles += 1;
      const lane = LANE_OF[role];
      const raw = (patch: string | null) => (patch === null ? 0 : rows.reduce((s, r) => s + (r.queue === id && r.lane === lane && r.dim === "games" && r.patch === patch ? r.n : 0), 0));
      const expected = laneWindow(raw(window.current), raw(window.previous), window);
      // R2: the window, the games (this queue's only: R8), the current patch's.
      if (!expected || expected.map(publicPatchName).join(",") !== b.patches.join(",")) bad(where, "window");
      const patches = expected ?? [];
      const counts = countsOf(rows, id, lane, patches);
      const games = sumN(counts.get("games"));
      if (b.games !== games || games < MIN_SECTION_GAMES) bad(where, "role-games");
      if (b.widened !== raw(window.current) < MIN_SECTION_GAMES || b.currentGames !== raw(window.current) || b.currentGames > b.games) bad(where, "current");
      if (b.queue !== queue) bad(where, "role-queue");
      const timeline = sumN(counts.get("timeline"));
      if (b.timelineGames !== timeline || timeline > games) bad(where, "timeline");
      for (const part of PARTS) {
        const shown = b[part] as BuildPart<unknown>;
        const again = rederivePart(counts.get(part), PART_FAMILY[part]);
        const at = `${where}/${part}`;
        out.parts[shown.state] += 1;
        // R3, R7: the state and the total.
        if (shown.state !== again.state) bad(at, "state");
        if (shown.total !== again.total) bad(at, "total");
        if (shown.total > games || (TIMELINE_PARTS.has(part) && shown.total > timeline)) bad(at, "total-bound");
        if (shown.state !== "shown" || again.state !== "shown") continue;
        // R4: the most common.
        if (shown.standard.key !== again.standard || shown.standard.games < MIN_CHOICE_GAMES || shown.standard.share < MIN_CHOICE_SHARE) bad(at, "standard");
        // R5, R6: the highest win rate, exactly where the rule finds one.
        if ((shown.performer?.key ?? null) !== again.performer) bad(at, "performer");
        if (shown.performer) {
          out.performers += 1;
          const p = shown.performer;
          const d = differenceInterval(p, shown.standard, PERFORMER_Z);
          if (p.games < MIN_PERFORMER_GAMES || p.share < MIN_PERFORMER_SHARE || p.key === shown.standard.key || p.winRate - shown.standard.winRate < PERFORMER_MARGIN || !d || d.low <= 0) bad(at, "performer-rule");
        }
      }
      // R10: the full build's later items each reliable.
      for (const full of [b.full, b.fullHighest]) {
        if (!full) continue;
        const reliable = (x: { games: number; total: number }) => x.games >= MIN_CHOICE_GAMES && x.total > 0 && x.games / x.total >= MIN_CHOICE_SHARE;
        if (!reliable(full.fourth) || (full.fifth && !reliable(full.fifth))) bad(`${where}/full`, "later-items");
      }
    }
  }
  return out;
}

/** The audit's totals over its champions. */
export function auditTotals(audits: readonly ChampionAudit[]): Omit<ChampionAudit, "violations"> & { violations: string[] } {
  const total: ChampionAudit = { violations: [], roles: 0, parts: { shown: 0, few: 0, varied: 0 }, performers: 0, widenedRoles: 0, queues: Object.fromEntries(BUILD_QUEUES.map((q) => [String(q), 0])) };
  for (const a of audits) {
    total.violations.push(...a.violations);
    total.roles += a.roles;
    total.performers += a.performers;
    total.widenedRoles += a.widenedRoles;
    for (const k of ["shown", "few", "varied"] as const) total.parts[k] += a.parts[k];
    for (const [q, n] of Object.entries(a.queues)) total.queues[q] = (total.queues[q] ?? 0) + n;
  }
  return total;
}
