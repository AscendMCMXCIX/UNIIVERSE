import { parseRiotId } from "@/domain/opgg";
import { formatMastery, parseMasteryText, roundMastery, type MasteryRounding } from "./mastery-input";
import type { Outcome, ShownPlayer } from "./mastery-match";

/*
  CLASH SCOUT TESTING LAB: a test is five opponents as the scouting screens would show them, typed
  or generated, with no screenshot and no tag. This module holds what both sides share: the
  scenario as the tester edits it (text as typed), its checks, its parsed form for the engine, the
  JSON a tester may export and import by hand, and the outdated-data variants. Nothing here is
  stored by the server.
*/

export const LAB_PLAYERS = 5;
export const LAB_CHAMPIONS = 5;

export interface LabChampionEntry {
  championId: string | null;
  /** As typed: "150,000", "150k", "150.4k", "1.2m", or empty for a champion without points. */
  points: string;
}

export interface LabPlayer {
  name: string;
  champions: LabChampionEntry[];
  /** The total mastery score, as typed (optional). */
  totalScore: string;
  /** Optional, shown for reference: ranks change too often to decide anything. */
  rank: { tier: string; division: string | null } | null;
}

export interface LabScenario {
  teamName: string;
  platform: string;
  /** "YYYY-MM-DD" the screens were seen, or "" for today. */
  referenceDate: string;
  /** The date is not known: any growth is possible. */
  dateUnknown: boolean;
  players: LabPlayer[];
}

export const emptyLabPlayer = (): LabPlayer => ({ name: "", champions: Array.from({ length: LAB_CHAMPIONS }, () => ({ championId: null, points: "" })), totalScore: "", rank: null });
export const emptyScenario = (platform = "oc1"): LabScenario => ({ teamName: "", platform, referenceDate: "", dateUnknown: false, players: Array.from({ length: LAB_PLAYERS }, emptyLabPlayer) });

/** What the parsed scenario gives the engine for each named player. */
export interface LabInput {
  slot: number;
  /** The name as a screen shows it, without a tag. */
  name: string;
  shown: ShownPlayer;
  /** The full Riot ID, when the tester typed the tag too: Riot checks it exactly. */
  riotId: string | null;
}

export interface LabIssue {
  /** "players.2.champions.1.points", "referenceDate"… */
  path: string;
  message: string;
}

const DAY = 86_400_000;

/** The time a reference date stands for: noon UTC that day, or now for today or no date. */
export function referenceTime(date: string, now: number): number {
  if (!date) return now;
  const t = Date.parse(`${date}T12:00:00Z`);
  return Number.isNaN(t) ? now : Math.min(t, now);
}

/** Checks a scenario and turns it into the engine's inputs; players without a name are not tested. */
export function parseScenario(s: LabScenario, now: number, knownChampion: (id: string) => boolean = () => true): { inputs: LabInput[]; issues: LabIssue[] } {
  const issues: LabIssue[] = [];
  if (s.referenceDate) {
    const t = Date.parse(`${s.referenceDate}T12:00:00Z`);
    if (Number.isNaN(t)) issues.push({ path: "referenceDate", message: "Not a date." });
    else if (t > now + DAY) issues.push({ path: "referenceDate", message: "The date is in the future." });
  }
  const capturedAt = s.dateUnknown ? null : referenceTime(s.referenceDate, now);
  const inputs: LabInput[] = [];
  s.players.slice(0, LAB_PLAYERS).forEach((p, slot) => {
    const name = p.name.trim();
    const filled = p.champions.some((c) => c.championId || c.points.trim()) || p.totalScore.trim();
    if (!name) {
      if (filled) issues.push({ path: `players.${slot}.name`, message: "Enter the name shown, or clear this player." });
      return;
    }
    let gameName = name, riotId: string | null = null;
    if (name.includes("#")) {
      const parts = parseRiotId(name);
      if (!parts) return void issues.push({ path: `players.${slot}.name`, message: "A full Riot ID is the name, # and a tag of 3 to 5 letters or digits (Name#OCE). Or leave the tag out." });
      gameName = parts.gameName;
      riotId = `${parts.gameName}#${parts.tagLine}`;
    } else if ([...name].length > 16) issues.push({ path: `players.${slot}.name`, message: "A Riot game name is at most 16 characters." });
    const seen = new Set<string>();
    const champions: ShownPlayer["champions"] = [];
    p.champions.slice(0, LAB_CHAMPIONS).forEach((c, i) => {
      const at = `players.${slot}.champions.${i}`;
      const text = c.points.trim();
      if (!c.championId) {
        if (text) issues.push({ path: `${at}.championId`, message: "Choose the champion for these points." });
        return;
      }
      if (!knownChampion(c.championId)) return void issues.push({ path: `${at}.championId`, message: "Unknown champion." });
      if (seen.has(c.championId)) return void issues.push({ path: `${at}.championId`, message: "This champion is already in this player's five." });
      seen.add(c.championId);
      if (!text) return void champions.push({ championId: c.championId, points: null, precision: 0 });
      const r = parseMasteryText(text);
      if (!r.ok) return void issues.push({ path: `${at}.points`, message: r.error });
      champions.push({ championId: c.championId, points: r.value.points, precision: r.value.precision });
    });
    let totalScore: number | null = null;
    const total = p.totalScore.trim().replace(/[,\s]/g, "");
    if (total) {
      if (!/^\d{1,5}$/.test(total) || Number(total) < 1) issues.push({ path: `players.${slot}.totalScore`, message: "The total mastery score is a whole number, such as 811." });
      else totalScore = Number(total);
    }
    // The client lists the five with the most points first; the engine needs that order.
    champions.sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
    inputs.push({ slot, name: gameName, shown: { champions, totalScore, capturedAt }, riotId });
  });
  if (!inputs.length && !issues.length) issues.push({ path: "players", message: "Enter at least one player's name." });
  return { inputs, issues };
}

/* ---------- JSON export (by hand, never automatic; reading a file back is lab-file.ts) ---------- */

export const LAB_FILE_KIND = "uniiverse-clash-lab";

export function exportScenario(s: LabScenario): string {
  return JSON.stringify({ kind: LAB_FILE_KIND, version: 1, scenario: s }, null, 2);
}

/** Inputs as the editor shows them (a generated blind test, a variant): names, figures as a screen writes them, the date. */
export function scenarioOf(inputs: LabInput[], platform: string, teamName: string): LabScenario {
  const at = inputs.find((i) => i.shown.capturedAt !== null)?.shown.capturedAt ?? null;
  return {
    teamName,
    platform,
    referenceDate: at === null ? "" : new Date(at).toISOString().slice(0, 10),
    dateUnknown: inputs.length > 0 && inputs.every((i) => i.shown.capturedAt === null),
    players: Array.from({ length: LAB_PLAYERS }, (_, slot) => {
      const i = inputs.find((x) => x.slot === slot);
      if (!i) return emptyLabPlayer();
      return {
        name: i.riotId ?? i.name,
        champions: Array.from({ length: LAB_CHAMPIONS }, (_, k) => {
          const c = i.shown.champions[k];
          return c ? { championId: c.championId, points: c.points === null ? "" : formatMastery(c.points, c.precision) } : { championId: null, points: "" };
        }),
        totalScore: i.shown.totalScore ? String(i.shown.totalScore) : "",
        rank: null,
      };
    }),
  };
}

/* ---------- Typing help ---------- */

const letters = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Lines such as "Riven 450,000", "1. Ambessa — 175k", "Kai'Sa: 120.3k" into a player's entries:
 * a champion's name (as Riot writes it, or without spaces and punctuation) then its points.
 */
export function parseMasteryLines(text: string, champions: ReadonlyArray<{ id: string; name: string }>): { entries: LabChampionEntry[]; unknown: string[] } {
  const byKey = new Map<string, string>();
  for (const c of champions) {
    byKey.set(letters(c.name), c.id);
    byKey.set(letters(c.id), c.id);
  }
  const entries: LabChampionEntry[] = [];
  const unknown: string[] = [];
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = /^(?:\d+[.)]\s*)?(.+?)[\s:=–—-]+([\d.,\s]+[kKmM]?)\s*(?:pts|points)?$/.exec(line);
    const name = (m?.[1] ?? line).trim();
    const id = byKey.get(letters(name));
    if (!id) {
      unknown.push(name);
      continue;
    }
    if (entries.length < LAB_CHAMPIONS) entries.push({ championId: id, points: (m?.[2] ?? "").trim() });
  }
  return { entries, unknown };
}

/* ---------- Example ---------- */

/** The brief's example opponent and four more, for learning how the Lab reads a test. */
export function exampleScenario(platform = "oc1"): LabScenario {
  const p = (name: string, list: Array<[string, string]>, totalScore = ""): LabPlayer => ({ name, champions: Array.from({ length: LAB_CHAMPIONS }, (_, i) => (list[i] ? { championId: list[i]![0], points: list[i]![1] } : { championId: null, points: "" })), totalScore, rank: null });
  return {
    teamName: "Example opponents",
    platform,
    referenceDate: "",
    dateUnknown: false,
    players: [
      p("Top Example", [["Riven", "450,000"], ["Ambessa", "175,000"], ["Gwen", "130,000"], ["Camille", "87,000"], ["Olaf", "42,000"]]),
      p("Jungle Example", [["LeeSin", "612.3k"], ["Viego", "301.8k"], ["Graves", "122.4k"], ["Khazix", "98.1k"], ["Kindred", "41.7k"]]),
      p("Mid Example", [["Ahri", "1.2m"], ["Syndra", "240k"], ["Orianna", "190k"], ["Viktor", "88k"], ["Akali", "35k"]]),
      p("Bot Example", [["Jinx", "380,450"], ["Kaisa", "275,200"], ["Ezreal", "201,000"], ["Caitlyn", "96,300"], ["Jhin", "77,900"]], "640"),
      p("Support Example", [["Thresh", "720k"], ["Nautilus", "260k"], ["Lulu", "150k"], ["Senna", ""], ["Braum", ""]]),
    ],
  };
}

/* ---------- Outdated-data variants ---------- */

export type VariantKind = "baseline" | "aged" | "top-five-change" | "reordered" | "rounded" | "missing" | "incomplete" | "renamed" | "decoys";

export interface VariantSpec {
  kind: VariantKind;
  /** aged, top-five-change, reordered: how many days before now the screens were seen. */
  days?: number;
  /** aged: how much the points grew since, in percent (the test assumes it: no rate is known). */
  growth?: number;
  /** aged: only every other champion grew (twice as much). */
  uneven?: boolean;
  /** missing: champions without points (from the fifth up); incomplete: champions kept. */
  count?: number;
  /** decoys (controlled test only): synthetic accounts per player, and how far their points stray (percent). */
  spread?: number;
}

export const VARIANT_LABEL: Record<VariantKind, string> = {
  baseline: "As entered",
  aged: "Screens older: points grew since",
  "top-five-change": "A champion left the top five, another entered",
  reordered: "Two champions in the other order",
  rounded: "Points rounded to thousands",
  missing: "Some points missing",
  incomplete: "Only the first champions shown",
  renamed: "The player changed their Riot ID",
  decoys: "Accounts with similar champion pools",
};

export const DEFAULT_VARIANTS: VariantSpec[] = [
  { kind: "baseline" },
  { kind: "aged", days: 60, growth: 15 },
  { kind: "top-five-change", days: 60 },
  { kind: "reordered", days: 30 },
  { kind: "rounded" },
  { kind: "missing", count: 2 },
  { kind: "incomplete", count: 3 },
  { kind: "renamed" },
  { kind: "decoys", count: 2, spread: 8 },
];

/**
 * One input as the variant would have shown it. `nextChampion` is the account's sixth champion
 * (known only to a blind test's grader-side code), used to make a champion enter the top five.
 */
export function applyVariant(input: LabInput, v: VariantSpec, now: number, nextChampion?: { championId: string; points: number } | null): LabInput {
  const shown = input.shown;
  const champions = shown.champions.map((c) => ({ ...c }));
  const older = (days: number) => now - Math.max(1, days) * DAY;
  switch (v.kind) {
    case "baseline":
    case "decoys":
      return input;
    case "aged": {
      const g = Math.max(0, v.growth ?? 15) / 100;
      return {
        ...input,
        shown: {
          ...shown,
          capturedAt: older(v.days ?? 60),
          champions: champions.map((c, i) => (c.points === null ? c : { ...c, points: Math.max(1, Math.round(c.points / (1 + (v.uneven ? (i % 2 ? 0 : 2 * g) : g)))) })),
          totalScore: shown.totalScore === null ? null : Math.max(1, Math.round(shown.totalScore / (1 + g / 4))),
        },
      };
    }
    case "top-five-change": {
      // The older screen showed the sixth champion where today's fifth now stands; today's fifth
      // had fewer points then.
      if (!nextChampion || champions.length < 5) return { ...input, shown: { ...shown, capturedAt: older(v.days ?? 60), champions: champions.slice(0, 4) } };
      const list = [...champions.slice(0, 4), { championId: nextChampion.championId, points: nextChampion.points, precision: 0 }];
      return { ...input, shown: { ...shown, capturedAt: older(v.days ?? 60), champions: list.sort((a, b) => (b.points ?? -1) - (a.points ?? -1)) } };
    }
    case "reordered": {
      if (champions.length < 3 || champions[1]!.points === null || champions[2]!.points === null) return input;
      // Then, the third had a little more than the second has now… and the second fewer.
      const second = champions[1]!, third = champions[2]!;
      const swapped = [champions[0]!, { ...third, points: third.points! }, { ...second, points: Math.max(1, Math.round(third.points! * 0.97)) }, ...champions.slice(3)];
      return { ...input, shown: { ...shown, capturedAt: older(v.days ?? 30), champions: swapped } };
    }
    case "rounded":
      return { ...input, shown: { ...shown, champions: champions.map((c) => (c.points === null ? c : { ...c, ...toThousands(c.points, c.precision) })) } };
    case "missing": {
      const n = Math.min(champions.length, Math.max(1, v.count ?? 2));
      return { ...input, shown: { ...shown, champions: champions.map((c, i) => (i >= champions.length - n ? { ...c, points: null, precision: 0 } : c)) } };
    }
    case "incomplete":
      return { ...input, shown: { ...shown, champions: champions.slice(0, Math.max(1, Math.min(5, v.count ?? 3))) } };
    case "renamed":
      return { ...input, name: renamed(input.name) };
  }
}

/**
 * A figure as a screen rounding to thousands would show it. A figure already rounded ("105.5k",
 * 105,450 to 105,549) can only be narrowed to thousands when its whole range rounds the same way;
 * when the range straddles a step, either thousand could be the screen's, so the range stays wide
 * enough to hold the first one (106k ± 550, never 106k ± 500, which would leave out 105,469).
 */
function toThousands(points: number, precision: number): { points: number; precision: number } {
  const low = roundMastery(Math.max(1, points - precision), "thousands");
  const high = roundMastery(points + precision, "thousands");
  if (low.points === high.points) return { points: low.points, precision: low.precision };
  const mid = roundMastery(points, "thousands");
  return { points: mid.points, precision: mid.precision + precision };
}

/** A different name, as if the player had changed their Riot ID since. */
export function renamed(name: string): string {
  return name.length < 14 ? `${name} II` : `${name.slice(0, 13)}2`;
}

/** Rounding the client applies, for generated tests. */
export const ROUNDING_LABEL: Record<MasteryRounding, string> = { client: "As the client shows them (175.4k)", thousands: "Rounded to thousands (175k)", exact: "Exact points (175,449)" };

/* ---------- Results ---------- */

/** How a test with known answers came out for one player. */
export type Grade = "correct" | "incorrect" | "ambiguous" | "not-identified" | "not-discovered" | "not-enough";

export const GRADE_LABEL: Record<Grade, string> = {
  correct: "Correct identification",
  incorrect: "Incorrect identification",
  ambiguous: "Ambiguous",
  "not-identified": "Not identified",
  "not-discovered": "No eligible candidate",
  "not-enough": "Not enough information",
};

/** The grade from the outcome and where the right account ranked (null: not among the candidates). */
export function gradeOf(outcome: Outcome, bestIsTruth: boolean, truthRank: number | null): Grade {
  if (outcome === "verified" || outcome === "strong") return bestIsTruth ? "correct" : "incorrect";
  if (outcome === "not-enough") return "not-enough";
  if (outcome === "ambiguous") return "ambiguous";
  if (truthRank === null) return "not-discovered";
  return "not-identified";
}
