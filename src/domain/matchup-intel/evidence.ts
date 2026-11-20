import { publicPatchName } from "@/domain/patch";
import { formatCount } from "@/lib/format";
import { parseRunePage } from "./prep";

/*
  MATCHUP INTEL's evidence lines (docs/MATCHUP_INTEL.md, "In your games"): every line counted from
  stored games, with its sample ("4 of 9 games · patch 26.23 · Solo/Duo 3, Normal Draft 6"), under
  its tier ("In your games (n = 9)", "In the team's games (n = 12)"). Shown only from MIN_GAMES
  games; the lane's end only from MIN_LANE_ENDS, and never as one minute. Nothing is inferred
  beyond what the games record, and nothing is a recommendation: the words are held to
  EVIDENCE_REFUSED_WORDS (evidence-words.test.ts renders every template).
*/

/** The fewest games a line is counted from (PLAN S7b: n ≥ 3). */
export const MIN_GAMES = 3;
/** The fewest measured lane ends shown as a range (n ≥ 10). */
export const MIN_LANE_ENDS = 10;

export type EvidenceField = "runes" | "spells" | "start" | "back" | "items" | "skills" | "max";
export const EVIDENCE_FIELDS: readonly EvidenceField[] = ["runes", "spells", "start", "back", "items", "skills", "max"];

const FIELD_LABEL: Record<EvidenceField, string> = {
  runes: "Rune page",
  spells: "Summoner spells",
  start: "Starting items",
  back: "First shop visit",
  items: "First completed items",
  skills: "First three skill points",
  max: "First skills to five points",
};

/** Riot's queue names, as the page writes them. */
export const QUEUE_NAMES: Readonly<Record<number, string>> = { 420: "Solo/Duo", 440: "Flex", 400: "Normal Draft", 430: "Blind", 480: "Swiftplay", 490: "Quickplay", 700: "Clash" };

/** One counted value of a field, at one patch and queue. */
export interface CountRow {
  patch: string;
  queue: number;
  value: string;
  n: number;
}

/** What the database counted for one set of games (one scope, one set of slots). */
export interface EvidenceCounts {
  /** Games by patch and queue, and how many were won. */
  games: Array<{ patch: string; queue: number; n: number; won: number }>;
  /** Each field's values, by patch and queue. */
  fields: Partial<Record<EvidenceField, CountRow[]>>;
  /** A jungler's early objectives, by patch and queue: games with them, taken by the champion's team, taken by both. */
  objectives: Array<{ patch: string; queue: number; games: number; taken: number; total: number }>;
  /** Measured lane ends (ms), by patch and queue. */
  ends: Array<{ patch: string; queue: number; end: number }>;
}

/** Names for what a line shows: champions, items, spells and runes (Data Dragon's), with a fallback for an unknown number. */
export interface EvidenceNames {
  champion: (id: string) => string;
  item: (id: string) => string | null;
  spell: (key: string) => string | null;
  rune: (id: string) => string | null;
}

export interface EvidenceLine {
  key: string;
  /** What the line counts ("Summoner spells"). */
  label: string;
  /** The counted values ("Flash + Ignite in 6, Flash + Teleport in 3"). */
  values: string;
  /** Its sample: "of 9 games · patch 26.22 · Solo/Duo 3, Normal Draft 6". */
  sample: string;
  /** Where the line's patches or positions need saying (the previous patch pooled, the older records' rule). */
  note?: string;
}

/** The patches a line counts: the current one, and the previous one only where Riot's data shows no change for what the line names. */
export interface PatchWindow {
  current: string;
  previous: string | null;
  /** Whether a set of named things is unchanged between the two (the per-version diff); never true for something not recorded. */
  unchanged: (named: ReadonlyArray<{ kind: "champion" | "item" | "rune"; key: string }>) => boolean;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** "Solo/Duo 3, Normal Draft 6": every queue the games come from, most first. */
export function queueSplit(rows: ReadonlyArray<{ queue: number; n: number }>): string {
  const by = new Map<number, number>();
  for (const r of rows) by.set(r.queue, (by.get(r.queue) ?? 0) + r.n);
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([q, n]) => `${QUEUE_NAMES[q] ?? `Queue ${q}`} ${formatCount(n)}`)
    .join(", ");
}

/** "patch 26.22" or "patches 26.22 and 26.21". */
export function patchWords(patches: readonly string[]): string {
  const names = patches.map(publicPatchName);
  return names.length > 1 ? `patches ${names.join(" and ")}` : `patch ${names[0]}`;
}

/** The sample after a line: "of 9 games · patch 26.22 · Solo/Duo 3, Normal Draft 6" (or "9 games …" for a record). */
export function sampleWords(n: number, patches: readonly string[], queues: ReadonlyArray<{ queue: number; n: number }>, of = true): string {
  return `${of ? "of " : ""}${formatCount(n)} ${n === 1 ? "game" : "games"} · ${patchWords(patches)} · ${queueSplit(queues)}`;
}

/** The items, spells or runes a value names, for the per-version diff. */
export function namedBy(field: EvidenceField, value: string): Array<{ kind: "item" | "rune"; key: string }> {
  if (field === "runes") return (parseRunePage(value)?.perks ?? []).map((id) => ({ kind: "rune" as const, key: String(id) }));
  if (field === "start" || field === "back" || field === "items") return value.split(/[,>]/).filter(Boolean).map((id) => ({ kind: "item" as const, key: id }));
  return [];
}

/** A value in words: "Conqueror, Triumph, Legend: Alacrity, Last Stand + Second Wind, Unflinching". */
export function valueWords(field: EvidenceField, value: string, names: EvidenceNames): string {
  const item = (id: string) => names.item(id) ?? `item ${id}`;
  switch (field) {
    case "runes": {
      const page = parseRunePage(value);
      if (!page) return value;
      const rune = (id: number) => names.rune(String(id)) ?? `rune ${id}`;
      return `${page.perks.slice(0, 4).map(rune).join(", ")} + ${page.perks.slice(4).map(rune).join(", ")}`;
    }
    case "spells":
      return value
        .split(",")
        .map((k) => names.spell(k) ?? `spell ${k}`)
        .join(" + ");
    case "start":
    case "back": {
      // Repeats as a count ("Health Potion ×2"), in the order Data Dragon numbers them.
      const counts = new Map<string, number>();
      for (const id of value.split(",").filter(Boolean)) counts.set(id, (counts.get(id) ?? 0) + 1);
      return [...counts.entries()].map(([id, k]) => `${item(id)}${k > 1 ? ` ×${k}` : ""}`).join(" + ");
    }
    case "items":
      return value.split(">").map(item).join(" > ");
    case "skills":
      return value.split("").join(" ");
    case "max":
      return value.split("").join(" > ");
  }
}

/**
 * The patches a line counts: the previous patch only where every chosen champion and everything the
 * line names are unchanged in Riot's data, and only when games on it are counted (`onPrevious`), so
 * a line never names a patch that added nothing.
 */
export function patchesFor(window: PatchWindow, champions: readonly string[], named: ReadonlyArray<{ kind: "item" | "rune"; key: string }>, onPrevious: number): string[] {
  if (!window.previous || onPrevious <= 0) return [window.current];
  return window.unchanged([...champions.map((c) => ({ kind: "champion" as const, key: c })), ...named]) ? [window.current, window.previous] : [window.current];
}

const onPatch = (rows: ReadonlyArray<{ patch: string; n?: number; games?: number }>, patch: string | null) => sum(rows.filter((r) => r.patch === patch).map((r) => r.n ?? r.games ?? 1));

/** The most counted values of a field (at most two), over the given patches. */
function topValues(rows: readonly CountRow[], patches: readonly string[]): { n: number; top: Array<{ value: string; n: number }>; queues: Array<{ queue: number; n: number }> } {
  const kept = rows.filter((r) => patches.includes(r.patch));
  const by = new Map<string, number>();
  for (const r of kept) by.set(r.value, (by.get(r.value) ?? 0) + r.n);
  const top = [...by.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([value, n]) => ({ value, n }));
  return { n: sum(kept.map((r) => r.n)), top, queues: kept.map((r) => ({ queue: r.queue, n: r.n })) };
}

const PREVIOUS_NOTE = "The previous patch is counted too: Riot's data shows no change between the two patches for the champion or what this line names.";

/** One field's line: its one or two most counted values, "in k" each, of its n; null under MIN_GAMES. */
export function fieldLine(field: EvidenceField, counts: EvidenceCounts, window: PatchWindow, champions: readonly string[], names: EvidenceNames): EvidenceLine | null {
  const rows = counts.fields[field] ?? [];
  // The top values on the current patch decide what the line names, and so whether the previous patch may join.
  const current = topValues(rows, [window.current]);
  const pooled = window.previous ? topValues(rows, [window.current, window.previous]) : current;
  const named = pooled.top.flatMap((t) => namedBy(field, t.value));
  const patches = patchesFor(window, champions, named, onPatch(rows, window.previous));
  const use = patches.length > 1 ? pooled : current;
  if (use.n < MIN_GAMES || !use.top.length) return null;
  const values = use.top.map((t) => `${valueWords(field, t.value, names)} in ${formatCount(t.n)}`).join(", ");
  return { key: field, label: FIELD_LABEL[field], values, sample: sampleWords(use.n, patches, use.queues), ...(patches.length > 1 ? { note: PREVIOUS_NOTE } : {}) };
}

/** The record of a set of games: "9 games, 5 won · patch 26.22 · Solo/Duo 3, Normal Draft 6"; null under MIN_GAMES. */
export function recordLine(key: string, label: string, counts: EvidenceCounts, window: PatchWindow, champions: readonly string[]): EvidenceLine | null {
  const { patches, n } = recordCount(counts, window, champions);
  if (n < MIN_GAMES) return null;
  const games = counts.games.filter((g) => patches.includes(g.patch));
  const won = sum(games.map((g) => g.won));
  return { key, label, values: `${formatCount(n)} ${n === 1 ? "game" : "games"}, ${formatCount(won)} won`, sample: `${patchWords(patches)} · ${queueSplit(games)}`, ...(patches.length > 1 ? { note: PREVIOUS_NOTE } : {}) };
}

/** The games a set counts and the patches they are on (the record's, which the section's tier states). */
export function recordCount(counts: EvidenceCounts, window: PatchWindow, champions: readonly string[]): { patches: string[]; n: number } {
  const patches = patchesFor(window, champions, [], onPatch(counts.games, window.previous));
  return { patches, n: sum(counts.games.filter((g) => patches.includes(g.patch)).map((g) => g.n)) };
}

/** A jungler's early objectives: "7 of 12 to Lee Sin's team" over the games that have them; null under MIN_GAMES. */
export function objectivesLine(counts: EvidenceCounts, window: PatchWindow, champions: readonly string[], names: EvidenceNames): EvidenceLine | null {
  const patches = patchesFor(window, champions, [], onPatch(counts.objectives, window.previous));
  const kept = counts.objectives.filter((o) => patches.includes(o.patch));
  const games = sum(kept.map((o) => o.games));
  if (games < MIN_GAMES) return null;
  const queues = kept.map((o) => ({ queue: o.queue, n: o.games }));
  return {
    key: "objectives",
    label: "Dragons, voidgrubs and heralds before 15:00",
    values: `${formatCount(sum(kept.map((o) => o.taken)))} of ${formatCount(sum(kept.map((o) => o.total)))} to ${names.champion(champions[0]!)}'s team`,
    sample: sampleWords(games, patches, queues, false),
    ...(patches.length > 1 ? { note: PREVIOUS_NOTE } : {}),
  };
}

/** m:ss of a time in ms. */
export function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The value at a share of a sorted list, read between neighbours. */
function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/**
 * The lane's end as a distribution: the middle half of the measured ends and their median, from
 * MIN_LANE_ENDS on; under it, "Not measured yet" with how many are measured. Never one minute alone.
 */
export function laneEndLine(counts: EvidenceCounts, window: PatchWindow, champions: readonly string[], jungle: boolean): EvidenceLine {
  const label = "Lane end";
  if (jungle) return { key: "end", label, values: "Not measured: the stored events do not say when an objective was contested", sample: "" };
  const patches = patchesFor(window, champions, [], counts.ends.filter((e) => e.patch === window.previous).length);
  const kept = counts.ends.filter((e) => patches.includes(e.patch));
  const ends = kept.map((e) => e.end).sort((a, b) => a - b);
  if (ends.length < MIN_LANE_ENDS) return { key: "end", label, values: `Not measured yet: ${formatCount(ends.length)} of the ${MIN_LANE_ENDS} games needed have positions`, sample: "" };
  return {
    key: "end",
    label,
    values: `the middle half between ${clock(quantile(ends, 0.25))} and ${clock(quantile(ends, 0.75))}, median ${clock(quantile(ends, 0.5))}`,
    sample: `n = ${formatCount(ends.length)} · ${patchWords(patches)} · ${queueSplit(kept.map((e) => ({ queue: e.queue, n: 1 })))}`,
    note: "The earlier of the lane's outer turret falling and either player leaving the lane for two frames in a row (trips to base excluded).",
  };
}

/** The tier a section of evidence states. */
export function scopeTier(scope: "own" | "team", n: number): string {
  return scope === "own" ? `In your games (n = ${formatCount(n)})` : `In the team's games (n = ${formatCount(n)})`;
}

/** The honest line of a section with no counted line: how few games there are, and where ("In your games: 2 as Riven against Darius on patch 26.22, fewer than the 3 a line needs."). */
export function fewGamesWords(scope: "own" | "team", n: number, what: string, patches: readonly string[]): string {
  const whose = scope === "own" ? "In your games" : "In the team's games";
  return n === 0 ? `${whose}: none as ${what} on ${patchWords(patches)}.` : `${whose}: ${formatCount(n)} as ${what} on ${patchWords(patches)}, fewer than the ${MIN_GAMES} a line needs.`;
}

export type EvidenceScope = "own" | "team";

export interface EvidenceSection {
  scope: EvidenceScope;
  /** "In your games (n = 9)"; null when the scope cannot be counted for this viewer. */
  tier: string | null;
  /** Games matching every chosen slot, on the patches counted. */
  n: number;
  lines: EvidenceLine[];
  /** The honest line when no line is counted (few games, no profile, not part of the access). */
  empty: string | null;
  /** Where some counted games know their lane opponent only by Riot's merged position (older records). */
  positionNote: string | null;
}

export interface MatchupEvidence {
  /** The patch counted ("26.22"); null when no current patch is known. */
  patch: string | null;
  /** The empty slots the lines ignore ("the enemy support"), said under the lines. */
  ignored: string[];
  sections: EvidenceSection[];
}

