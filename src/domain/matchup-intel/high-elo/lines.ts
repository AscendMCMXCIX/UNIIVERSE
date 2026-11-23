import { formatCount, percent } from "@/lib/format";
import type { RiotRegion } from "@/domain/riot-platforms";
import { clock, namedBy, patchWords, patchesFor, valueWords, type EvidenceField, type EvidenceLine, type EvidenceNames, type PatchWindow } from "@/domain/matchup-intel/evidence";
import { addCounts, effectiveSize, HIGH_ELO_CHOICES, shareOf, weightedQuantile, wonShare, ZERO, type HighEloChoice, type HighEloKind, type WeightedCount } from "./counts";

/*
  MATCHUP INTEL's high-elo evidence lines (docs/HIGH_ELO_EVIDENCE.md, "What the page shows"): what
  the observed Master+ games say for one champion in one role, and against the chosen lane
  opponent, for all regions or one. Every line states its n and its effective sample; a share or a
  result is shown only from its threshold, a result always with its 95% interval and never as a
  verdict, a choice always beside the alternatives at ALT_SHARE or more. Under a threshold the line
  says how many games there are and how many it needs. Nothing here is advice: the section's title
  says the games were observed, and the words are held to EVIDENCE_REFUSED_WORDS
  (evidence-words.test.ts renders every template).
*/

/** The fewest effective games a result is shown from. */
export const HIGH_MIN_RECORD = 30;
/** The fewest effective games a choice's shares are shown from (mi-evidence §2.4: a 50% share is ±9.6 points at 100). */
export const HIGH_MIN_CHOICES = 100;
/** The fewest effective games against the chosen opponent a result against them is shown from. */
export const HIGH_MIN_PAIR = 100;
/** The fewest measured lane ends shown as a range. */
export const HIGH_MIN_LANE_ENDS = 30;
/** The smallest share an alternative choice is named at. */
export const ALT_SHARE = 0.15;
/** At most this many values a choice line names. */
const MAX_VALUES = 3;

export type HighEloRegion = "all" | RiotRegion;
export const HIGH_ELO_REGIONS: readonly HighEloRegion[] = ["all", "americas", "europe", "asia", "sea"];
export const REGION_NAMES: Record<HighEloRegion, string> = { all: "All regions", americas: "Americas", europe: "Europe", asia: "Korea and Japan", sea: "Southeast Asia and Oceania" };

/** A stored row, as the page reads it for one role and champion. */
export interface HighEloRow extends WeightedCount {
  patch: string;
  region: RiotRegion;
  /** "" for every opponent. */
  opponent: string;
  kind: HighEloKind;
  value: string;
}

export interface HighEloSection {
  region: HighEloRegion;
  /** "Observed in Master+ ranked games · all regions (n = 1,240)". */
  tier: string;
  /** Games of the champion in the role, on the patches the record counts. */
  n: number;
  lines: EvidenceLine[];
  /** The one honest line when nothing can be shown (none counted, or fewer than a result needs). */
  empty: string | null;
  /**
   * What the choice lines are counted from, said once above them ("Choices, of 640 games (effective
   * 424) · patch 26.23 · against every opponent"); a line states its own sample only where it
   * differs (fewer games record that choice, or other patches). Null when no choice line is shown.
   */
  choices: string | null;
}

const CHOICE_LABEL: Record<HighEloChoice, string> = {
  ks: "Keystone",
  spells: "Summoner spells",
  start: "Starting items",
  item1: "First completed item",
  skills: "First three skill points",
  max: "First skills to five points",
};

/** The team evidence's field a choice is worded as (the keystone is a rune; the first item an item path of one). */
const AS_FIELD: Record<Exclude<HighEloChoice, "ks">, EvidenceField> = { spells: "spells", start: "start", item1: "items", skills: "skills", max: "max" };

function choiceWords(kind: HighEloChoice, value: string, names: EvidenceNames): string {
  if (kind === "ks") return names.rune(value) ?? `rune ${value}`;
  return valueWords(AS_FIELD[kind], value, names);
}

function choiceNamed(kind: HighEloChoice, value: string): Array<{ kind: "item" | "rune"; key: string }> {
  if (kind === "ks") return [{ kind: "rune", key: value }];
  return namedBy(AS_FIELD[kind], value);
}

const sumOf = (rows: readonly WeightedCount[]) => rows.reduce<WeightedCount>((a, r) => addCounts(a, r), ZERO);

/** "51.3% won (95% interval 48.2–54.4%)", saying so when the interval includes 50%. */
export function wonWords(c: WeightedCount): string {
  const s = wonShare(c);
  if (!s) return "no result counted";
  const includes = s.low <= 0.5 && s.high >= 0.5;
  return `${percent(s.share)} won (95% interval ${percent(s.low)}–${percent(s.high)}${includes ? ", which includes 50%" : ""})`;
}

/** "n = 1,240 (effective 980)": the games observed, and what their weights are worth when it is less. */
export function sampleSize(c: WeightedCount): string {
  const eff = Math.floor(effectiveSize(c));
  return eff < c.n ? `n = ${formatCount(c.n)} (effective ${formatCount(eff)})` : `n = ${formatCount(c.n)}`;
}

/** "399 games (effective 320)": the games a share is of, and what their weights are worth when it is less. */
export function gamesWords(c: WeightedCount): string {
  const eff = Math.floor(effectiveSize(c));
  return `${formatCount(c.n)} ${c.n === 1 ? "game" : "games"}${eff < c.n ? ` (effective ${formatCount(eff)})` : ""}`;
}

/**
 * The section for one champion in one role, against `opponent` where one is chosen: its rows (every
 * region; `region` picks which are counted), the patch window, and the names to word values with.
 */
export function highEloSection(input: {
  rows: readonly HighEloRow[];
  region: HighEloRegion;
  window: PatchWindow;
  champion: string;
  opponent: string | null;
  roleName: string;
  names: EvidenceNames;
}): HighEloSection {
  const { window, champion, opponent, roleName, names } = input;
  const rows = input.region === "all" ? input.rows : input.rows.filter((r) => r.region === input.region);
  const who = `${names.champion(champion)} in ${roleName}`;
  const regionWords = input.region === "all" ? "all regions" : REGION_NAMES[input.region];
  const pick = (opp: string, kind: HighEloKind, patches: readonly string[]) => rows.filter((r) => r.opponent === opp && r.kind === kind && patches.includes(r.patch));
  const onPrevious = (opp: string, kind: HighEloKind) => (window.previous ? pick(opp, kind, [window.previous]).reduce((s, r) => s + r.n, 0) : 0);
  const champions = opponent ? [champion, opponent] : [champion];

  // The record: the current patch, and the previous one only where Riot's data shows the champions unchanged.
  const recordPatches = patchesFor(window, champions, [], onPrevious("", "games"));
  const games = sumOf(pick("", "games", recordPatches));
  const tier = `Observed in Master+ ranked games · ${regionWords} (n = ${formatCount(games.n)})`;
  if (effectiveSize(games) < HIGH_MIN_RECORD) {
    const empty =
      games.n === 0
        ? `Master+ games: none counted for ${who} on ${patchWords(recordPatches)} yet.`
        : `Master+ games: ${formatCount(games.n)} for ${who} on ${patchWords(recordPatches)} (effective ${formatCount(Math.floor(effectiveSize(games)))}), fewer than the ${HIGH_MIN_RECORD} a result needs.`;
    return { region: input.region, tier, n: games.n, lines: [], empty, choices: null };
  }

  const lines: EvidenceLine[] = [];
  lines.push({ key: "record", label: who, values: wonWords(games), sample: `${sampleSize(games)} · ${patchWords(recordPatches)}` });

  if (opponent) {
    const pairPatches = patchesFor(window, champions, [], onPrevious(opponent, "games"));
    const pair = sumOf(pick(opponent, "games", pairPatches));
    const vs = `Against ${names.champion(opponent)}`;
    if (effectiveSize(pair) >= HIGH_MIN_PAIR) lines.push({ key: "pair", label: vs, values: wonWords(pair), sample: `${sampleSize(pair)} · ${patchWords(pairPatches)} · lane opponent confirmed by Riot's positions` });
    else
      lines.push({
        key: "pair",
        label: vs,
        values: `${formatCount(pair.n)} ${pair.n === 1 ? "game" : "games"} with the lane opponent confirmed (effective ${formatCount(Math.floor(effectiveSize(pair)))}), fewer than the ${HIGH_MIN_PAIR} a result against one opponent needs`,
        sample: "",
      });
  }

  const choiceLines = HIGH_ELO_CHOICES.flatMap((kind) => choiceLine(kind, rows, window, champions, names, { games, patches: recordPatches }) ?? []);
  lines.push(...choiceLines);
  lines.push(laneEndLine(rows, window, champions, champion, opponent, names));
  // What the choices are counted from, said once above them; a line says its own only where it differs.
  const choices = choiceLines.length ? `Choices, of ${gamesWords(games)} · ${patchWords(recordPatches)}${opponent ? " · against every opponent" : ""}` : null;
  return { region: input.region, tier, n: games.n, lines, empty: null, choices };
}

/** A choice's line: the most common value and every other at ALT_SHARE or more, each with its share; null under HIGH_MIN_CHOICES. */
function choiceLine(kind: HighEloChoice, rows: readonly HighEloRow[], window: PatchWindow, champions: readonly string[], names: EvidenceNames, section: { games: WeightedCount; patches: readonly string[] }): EvidenceLine | null {
  const values = (patches: readonly string[]) => {
    const by = new Map<string, WeightedCount>();
    for (const r of rows) if (r.opponent === "" && r.kind === kind && patches.includes(r.patch)) by.set(r.value, addCounts(by.get(r.value) ?? ZERO, r));
    return by;
  };
  // A share is of the games where this choice is recorded (a game without a timeline records no skill order).
  const totalOf = (patches: readonly string[]) => sumOf([...values(patches).values()]);
  const top = (by: Map<string, WeightedCount>, total: WeightedCount) =>
    [...by.entries()]
      .map(([value, c]) => ({ value, c, share: shareOf(c, total) }))
      .sort((a, b) => b.share - a.share || a.value.localeCompare(b.value))
      .filter((v, i) => i === 0 || v.share >= ALT_SHARE)
      .slice(0, MAX_VALUES);
  // The current patch's most common values decide what the line names, and so whether the previous patch may join.
  const current = top(values([window.current]), totalOf([window.current]));
  const onPrevious = window.previous ? rows.filter((r) => r.opponent === "" && r.kind === kind && r.patch === window.previous).reduce((s, r) => s + r.n, 0) : 0;
  const named = current.flatMap((v) => choiceNamed(kind, v.value));
  const patches = patchesFor(window, champions.slice(0, 1), named, onPrevious);
  const total = totalOf(patches);
  const shown = patches.length > 1 ? top(values(patches), total) : current;
  if (effectiveSize(total) < HIGH_MIN_CHOICES || !shown.length) return null;
  // Its own sample only where it differs from the section's ("Choices, of 640 games · patch 26.23" above the lines).
  const own = [total.n !== section.games.n ? `of ${gamesWords(total)}` : null, patches.join() !== section.patches.join() ? patchWords(patches) : null].filter(Boolean).join(" · ");
  return {
    key: kind,
    label: CHOICE_LABEL[kind],
    values: shown.map((v) => `${choiceWords(kind, v.value, names)} ${percent(v.share, 0)}`).join(" · "),
    sample: own,
    named: shown.flatMap((v) => choiceNamed(kind, v.value)),
  };
}

/** The lane's end as a weighted distribution, against the opponent where enough are measured, else against everyone (said as such). */
function laneEndLine(rows: readonly HighEloRow[], window: PatchWindow, champions: readonly string[], champion: string, opponent: string | null, names: EvidenceNames): EvidenceLine {
  const ends = (opp: string) => {
    const patches = patchesFor(window, opp ? champions : [champion], [], window.previous ? rows.filter((r) => r.opponent === opp && r.kind === "end" && r.patch === window.previous).length : 0);
    const kept = rows.filter((r) => r.opponent === opp && r.kind === "end" && patches.includes(r.patch));
    return { patches, kept, n: kept.reduce((s, r) => s + r.n, 0) };
  };
  const pair = opponent ? ends(opponent) : null;
  const use = pair && pair.n >= HIGH_MIN_LANE_ENDS ? pair : ends("");
  const against = use === pair && opponent ? ` · against ${names.champion(opponent)}` : opponent ? " · against every opponent" : "";
  if (use.n < HIGH_MIN_LANE_ENDS) return { key: "end", label: "Lane end", values: `Not measured yet: ${formatCount(use.n)} of the ${HIGH_MIN_LANE_ENDS} games needed have a measured lane end`, sample: "" };
  const buckets = new Map<number, number>();
  for (const r of use.kept) buckets.set(Number(r.value), (buckets.get(Number(r.value)) ?? 0) + r.w);
  const list = [...buckets.entries()].map(([value, w]) => ({ value, w }));
  const q = (p: number) => clock(weightedQuantile(list, p) ?? 0);
  return {
    key: "end",
    label: "Lane end",
    values: `the middle half between ${q(0.25)} and ${q(0.75)}, median ${q(0.5)}`,
    sample: `n = ${formatCount(use.n)} measured · ${patchWords(use.patches)}${against}`,
  };
}
