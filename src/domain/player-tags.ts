import { ROLE_LABELS, type Role } from "./roles";
import type { ChampionTraits, TraitKey } from "./champion-model/traits";
import type { ProficiencyTier } from "./proficiency";

/*
  Strength tags on Team cards: two or three short, positive labels a teammate can trust.

  Two kinds, never mixed up:
    - experience / playstyle ("Experienced Fighter Player", "Engage Specialist"): what the player
      has PROVEN experience on. Only pool champions they are Strong or Very strong on count
      (the same proficiency the profile and the draft engine use), weighted by games;
    - measured performance ("Efficient KDA", "Vision Focused"): this season's numbers on their
      pool champions, only with enough games behind them (MIN_GAMES) and above a clear threshold.
  Nothing is said about laning, macro or decision-making: the data cannot show those.

  Stability: performance tags already held stay until the figure drops 5% below its threshold
  (one or two games never flip a tag), and every tag needs a minimum sample. When nothing is
  proven, the card shows a neutral description of the configured roles and champions instead.
*/

export type TagKind = "playstyle" | "performance" | "neutral";

export interface PlayerTag {
  key: string;
  label: string;
  kind: TagKind;
  /** One sentence: the evidence behind the tag (shown as a tooltip). */
  reason: string;
}

export interface TagChampion {
  championId: string;
  name: string;
  role: Role;
  /** Data Dragon classes ("Fighter", "Tank", ...). */
  classes: string[];
  traits: ChampionTraits;
  tier: ProficiencyTier;
  /** Games on record across the player's accounts. */
  games: number;
}

export interface TagPerformance {
  /** Pool-champion games this season (all supported modes). */
  games: number;
  winRate: number | null;
  detailedGames: number;
  kdaRatio: number | null;
  csPerMinute: number | null;
  csGames: number;
  visionPerGame: number | null;
  visionGames: number;
}

export interface TagInput {
  primaryRole: Role;
  /** Configured roles in preference order. */
  roles: Role[];
  champions: TagChampion[];
  performance: TagPerformance | null;
  /** Keys of the tags shown last time (for stability). */
  previous?: string[];
}

export const MIN_GAMES = { performance: 30, detailed: 20, provenChampion: 6 } as const;
const PROVEN: ProficiencyTier[] = ["core", "strong"];
const MAX_TAGS = 3;

const CLASS_TAGS: Record<string, string> = { Fighter: "Fighter", Tank: "Tank", Mage: "Mage", Assassin: "Assassin", Marksman: "Marksman", Support: "Support" };

const TRAIT_TAGS: Array<{ trait: TraitKey; key: string; label: string; what: string }> = [
  { trait: "engage", key: "engage", label: "Engage Specialist", what: "engage" },
  { trait: "frontline", key: "frontline", label: "Reliable Frontline", what: "frontline" },
  { trait: "peel", key: "peel", label: "Protects the Carries", what: "peel" },
  { trait: "scaling", key: "scaling", label: "Late-Game Carry", what: "late-game scaling" },
  { trait: "earlyGame", key: "early", label: "Early Pressure", what: "early-game pressure" },
  { trait: "pick", key: "pick", label: "Pick Threat", what: "catch and pick potential" },
  { trait: "sideLane", key: "splitpush", label: "Side-Lane Pressure", what: "side-lane pressure" },
];

/** Performance thresholds by primary role (a support's CS or a marksman's vision are judged fairly). */
function thresholds(role: Role) {
  return {
    winRate: 0.55,
    kda: role === "SUPPORT" ? 3.8 : 3.3,
    csPerMinute: role === "JUNGLE" ? 6.6 : role === "SUPPORT" ? Infinity : 7.6,
    vision: role === "SUPPORT" ? 70 : role === "JUNGLE" ? 40 : 28,
  };
}

const list = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and more`);

export function strengthTags(input: TagInput): PlayerTag[] {
  const tags: Array<PlayerTag & { weight: number }> = [];
  const held = new Set(input.previous ?? []);
  const proven = input.champions.filter((c) => PROVEN.includes(c.tier) && c.games >= MIN_GAMES.provenChampion);
  const provenGames = proven.reduce((s, c) => s + c.games, 0);

  // Experience: a champion class that most of their proven games are on.
  if (provenGames > 0) {
    const byClass = new Map<string, { games: number; names: string[] }>();
    for (const c of proven) {
      const cls = c.classes.map((x) => CLASS_TAGS[x]).find(Boolean);
      if (!cls) continue;
      const e = byClass.get(cls) ?? { games: 0, names: [] };
      e.games += c.games;
      e.names.push(c.name);
      byClass.set(cls, e);
    }
    const best = [...byClass.entries()].sort((a, b) => b[1].games - a[1].games)[0];
    if (best && best[1].games >= 40 && best[1].games / provenGames >= 0.5) {
      tags.push({ key: `class-${best[0].toLowerCase()}`, label: `Experienced ${best[0]} Player`, kind: "playstyle", reason: `${best[1].games} games on ${best[0].toLowerCase()} champions they are strong on (${list(best[1].names)}).`, weight: 3 + best[1].games / 100 });
    }
    // Playstyle traits weighted by proven games.
    for (const t of TRAIT_TAGS) {
      const on = proven.filter((c) => c.traits[t.trait] >= 2);
      const games = on.reduce((s, c) => s + c.games, 0);
      if (on.length >= 1 && games >= 30 && games / provenGames >= 0.45) {
        tags.push({ key: t.key, label: t.label, kind: "playstyle", reason: `Most of their proven champion experience brings ${t.what} (${list(on.map((c) => c.name))}).`, weight: 2 + games / provenGames });
      }
    }
    // A signature champion: very strong with a large sample.
    const signature = proven.filter((c) => c.tier === "core" && c.games >= 100).sort((a, b) => b.games - a.games)[0];
    if (signature) tags.push({ key: `signature-${signature.championId}`, label: `${signature.name} Specialist`, kind: "playstyle", reason: `${signature.games} games on ${signature.name}, played recently: very strong.`, weight: 2.5 + signature.games / 400 });
    // Real depth across roles.
    const rolesWithProof = new Set(proven.map((c) => c.role));
    if (rolesWithProof.size >= 2) tags.push({ key: "flex", label: "Multi-Role Flex", kind: "playstyle", reason: `Strong champions in ${[...rolesWithProof].map((r) => ROLE_LABELS[r]).join(" and ")}.`, weight: 2.2 });
    else {
      const deep = proven.filter((c) => c.role === input.primaryRole);
      if (deep.length >= 4) tags.push({ key: "deep-pool", label: `Deep ${ROLE_LABELS[input.primaryRole]} Pool`, kind: "playstyle", reason: `${deep.length} ${ROLE_LABELS[input.primaryRole]} champions rated Strong or better.`, weight: 2.1 });
    }
  }

  // Measured performance this season (enough games, clear threshold, 5% grace for held tags).
  const p = input.performance;
  if (p) {
    const th = thresholds(input.primaryRole);
    const ok = (key: string, value: number | null, threshold: number) => value !== null && Number.isFinite(threshold) && value >= (held.has(key) ? threshold * 0.95 : threshold);
    if (p.games >= MIN_GAMES.performance && ok("form", p.winRate, th.winRate)) tags.push({ key: "form", label: "Strong Season Form", kind: "performance", reason: `${Math.round((p.winRate ?? 0) * 100)}% win rate over ${p.games} games on pool champions this season.`, weight: 2.6 });
    if (p.detailedGames >= MIN_GAMES.detailed && ok("kda", p.kdaRatio, th.kda)) tags.push({ key: "kda", label: "Efficient KDA", kind: "performance", reason: `${p.kdaRatio!.toFixed(1)} KDA ratio over ${p.detailedGames} games this season.`, weight: 2.4 });
    if (p.csGames >= MIN_GAMES.detailed && ok("cs", p.csPerMinute, th.csPerMinute)) tags.push({ key: "cs", label: "Consistent Farmer", kind: "performance", reason: `${p.csPerMinute!.toFixed(1)} CS per minute over ${p.csGames} games this season.`, weight: 2.3 });
    if (p.visionGames >= MIN_GAMES.detailed && ok("vision", p.visionPerGame, th.vision)) tags.push({ key: "vision", label: "Vision Focused", kind: "performance", reason: `${Math.round(p.visionPerGame!)} vision score per game over ${p.visionGames} games this season.`, weight: 2.3 });
  }

  // Strongest first, at most one class tag and a mix of kinds when available.
  tags.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const chosen: PlayerTag[] = [];
  const perf = tags.filter((t) => t.kind === "performance");
  const play = tags.filter((t) => t.kind === "playstyle");
  if (perf[0] && play.length >= 2) {
    chosen.push(...play.slice(0, MAX_TAGS - 1), perf[0]);
  } else {
    chosen.push(...tags.slice(0, MAX_TAGS));
  }
  if (chosen.length > 0) return chosen.map(({ key, label, kind, reason }) => ({ key, label, kind, reason }));

  // Not enough evidence yet: a neutral description of what they play (never a claimed strength).
  const neutral: PlayerTag[] = [{ key: "role", label: `${ROLE_LABELS[input.primaryRole]} Main`, kind: "neutral", reason: "Their primary role. Strength tags appear as Riot data shows proven champions." }];
  if (input.roles.length >= 2) neutral.push({ key: "roles", label: `Also ${input.roles.slice(1, 3).map((r) => ROLE_LABELS[r]).join(" / ")}`, kind: "neutral", reason: "Other configured roles." });
  return neutral;
}

/** A stable fingerprint of the evidence behind the tags (recompute only when it changes). */
export function tagInputsHash(input: TagInput): string {
  const p = input.performance;
  const bucket = (v: number | null, step: number) => (v === null ? "-" : String(Math.round(v / step)));
  const parts = [
    input.primaryRole,
    input.roles.join(","),
    input.champions.map((c) => `${c.championId}:${c.role}:${c.tier}:${Math.floor(c.games / 5)}`).join("|"),
    p ? [Math.floor(p.games / 5), bucket(p.winRate, 0.01), Math.floor(p.detailedGames / 5), bucket(p.kdaRatio, 0.1), bucket(p.csPerMinute, 0.1), bucket(p.visionPerGame, 1)].join(",") : "none",
  ];
  let h = 2166136261;
  for (const ch of parts.join("#")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}
