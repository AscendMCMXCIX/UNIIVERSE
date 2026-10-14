import { ROLE_LABELS, type Role } from "./roles";
import type { ChampionTraits, TraitKey } from "./champion-model/traits";
import type { ProficiencyTier } from "./proficiency";

/*
  Strength tags on Team cards: two or three short, positive labels a teammate can trust.

  Two kinds, never mixed up:
    - experience / playstyle ("Proven Fighter", "Engage Specialist"): what the player
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

/** A possible tag with how strongly the evidence supports it. */
interface Candidate extends PlayerTag {
  weight: number;
  /** Tags of one family never appear together (one class description, one signature champion…). */
  family: string;
  /** A role-qualified wording of the same evidence, used when a teammate already shows the generic one. */
  alt?: string;
  /** Specific tags (a champion, a role-qualified style, breadth) beat generic ones a teammate shares. */
  specific?: boolean;
}

/** Role-qualified wordings: the same evidence, said in a way that tells teammates apart. */
const CLASS_IN_ROLE: Partial<Record<string, Partial<Record<Role, string>>>> = {
  Fighter: { TOP: "Top-Lane Skirmisher", JUNGLE: "Bruiser Jungler", MID: "Mid-Lane Fighter", SUPPORT: "Fighter Support" },
  Tank: { TOP: "Top-Lane Tank", JUNGLE: "Tank Jungler", SUPPORT: "Tank Support", MID: "Mid-Lane Tank" },
  Mage: { MID: "Mid-Lane Mage", SUPPORT: "Mage Support", TOP: "Top-Lane Mage", ADC: "Mage Bot Laner", JUNGLE: "Mage Jungler" },
  Assassin: { MID: "Mid-Lane Assassin", JUNGLE: "Assassin Jungler", TOP: "Top-Lane Assassin", SUPPORT: "Assassin Support" },
  Marksman: { ADC: "Bot-Lane Marksman", MID: "Mid-Lane Marksman", TOP: "Top-Lane Marksman" },
  Support: { SUPPORT: "Enchanter Support", MID: "Utility Mid Laner" },
};
const TRAIT_IN_ROLE: Partial<Record<string, Partial<Record<Role, string>>>> = {
  early: { TOP: "Lane Bully", JUNGLE: "Early-Game Ganker", MID: "Mid Lane Pressure", ADC: "Lane-Dominant Carry", SUPPORT: "Lane-Bully Support" },
  scaling: { TOP: "Late-Game Top Carry", JUNGLE: "Scaling Jungler", MID: "Late-Game Mid Carry", ADC: "Hyper-Carry Marksman", SUPPORT: "Scaling Support" },
  engage: { TOP: "Engage Top Laner", JUNGLE: "Engage Jungler", MID: "Engage Mid Laner", SUPPORT: "Engage Support" },
  frontline: { TOP: "Frontline Top Laner", JUNGLE: "Frontline Jungler", SUPPORT: "Frontline Support" },
  pick: { JUNGLE: "Pick-Off Jungler", MID: "Pick-Off Mid Laner", SUPPORT: "Hook & Pick Support" },
  splitpush: { TOP: "Split-Push Threat", MID: "Side-Lane Mid Laner" },
  peel: { SUPPORT: "Carry Protector", ADC: "Self-Peel Marksman" },
};

/** Every tag the evidence supports for one player, strongest first (before team-level choices). */
function candidates(input: TagInput): Candidate[] {
  const tags: Candidate[] = [];
  const held = new Set(input.previous ?? []);
  const proven = input.champions.filter((c) => PROVEN.includes(c.tier) && c.games >= MIN_GAMES.provenChampion);
  const provenGames = proven.reduce((s, c) => s + c.games, 0);
  const mainRoleOf = (list: TagChampion[]): Role => {
    const byRole = new Map<Role, number>();
    for (const c of list) byRole.set(c.role, (byRole.get(c.role) ?? 0) + c.games);
    return [...byRole.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? input.primaryRole;
  };

  if (provenGames > 0) {
    // Experience: a champion class most of their proven games are on.
    const byClass = new Map<string, { games: number; list: TagChampion[] }>();
    for (const c of proven) {
      const cls = c.classes.map((x) => CLASS_TAGS[x]).find(Boolean);
      if (!cls) continue;
      const e = byClass.get(cls) ?? { games: 0, list: [] };
      e.games += c.games;
      e.list.push(c);
      byClass.set(cls, e);
    }
    const best = [...byClass.entries()].sort((a, b) => b[1].games - a[1].games)[0];
    if (best && best[1].games >= 40 && best[1].games / provenGames >= 0.5) {
      const [cls, e] = best;
      const role = mainRoleOf(e.list);
      const names = list(e.list.map((c) => c.name));
      const weight = 3 + e.games / 100;
      tags.push({ key: `class-${cls.toLowerCase()}`, label: `Proven ${cls}`, kind: "playstyle", family: "class", reason: `${e.games} games on ${cls.toLowerCase()} champions they are strong on (${names}).`, weight, alt: CLASS_IN_ROLE[cls]?.[role] });
      // A narrower description of the same experience: ability-power fighters or assassins.
      const ap = e.list.filter((c) => c.traits.magicDamage >= 2 && c.traits.magicDamage > c.traits.physicalDamage);
      const apGames = ap.reduce((s, c) => s + c.games, 0);
      if ((cls === "Fighter" || cls === "Assassin" || cls === "Tank") && ap.length >= 2 && apGames / e.games >= 0.6) {
        tags.push({ key: `ap-${cls.toLowerCase()}`, label: `AP ${cls} Pool`, kind: "playstyle", family: "class", reason: `Most of their ${cls.toLowerCase()} experience is on magic-damage champions (${list(ap.map((c) => c.name))}).`, weight: weight + 0.2, specific: true });
      }
    }
    // Playstyle traits weighted by proven games.
    for (const t of TRAIT_TAGS) {
      const on = proven.filter((c) => c.traits[t.trait] >= 2);
      const games = on.reduce((s, c) => s + c.games, 0);
      if (on.length >= 1 && games >= 30 && games / provenGames >= 0.45) {
        tags.push({ key: t.key, label: t.label, kind: "playstyle", family: `trait-${t.key}`, reason: `Most of their proven champion experience brings ${t.what} (${list(on.map((c) => c.name))}).`, weight: 2 + games / provenGames, alt: TRAIT_IN_ROLE[t.key]?.[mainRoleOf(on)] });
      }
    }
    // A signature champion: very strong with a large sample, or the clear centre of their experience.
    const signature = [...proven].sort((a, b) => b.games - a.games)[0];
    if (signature && ((signature.tier === "core" && signature.games >= 100) || (signature.games >= 40 && signature.games / provenGames >= 0.35))) {
      const strong = signature.tier === "core" && signature.games >= 100;
      tags.push({ key: `signature-${signature.championId}`, label: strong ? `${signature.name} Specialist` : `Strong on ${signature.name}`, kind: "playstyle", family: "signature", reason: `${signature.games} games on ${signature.name}${strong ? ", played recently: very strong" : `, ${Math.round((signature.games / provenGames) * 100)}% of their proven experience`}.`, weight: (strong ? 2.5 : 2.3) + signature.games / 400, specific: true });
    }
    // Real depth across roles, or within their main role.
    const rolesWithProof = new Set(proven.map((c) => c.role));
    if (rolesWithProof.size >= 2) tags.push({ key: "flex", label: "Multi-Role Flex", kind: "playstyle", family: "breadth", reason: `Strong champions in ${[...rolesWithProof].map((r) => ROLE_LABELS[r]).join(" and ")}.`, weight: 2.2, specific: true });
    else {
      const deep = proven.filter((c) => c.role === input.primaryRole);
      if (deep.length >= 4) tags.push({ key: "deep-pool", label: `Deep ${ROLE_LABELS[input.primaryRole]} Pool`, kind: "playstyle", family: "breadth", reason: `${deep.length} ${ROLE_LABELS[input.primaryRole]} champions rated Strong or better.`, weight: 2.1, specific: true });
    }
    // Breadth of styles: proven on several kinds of champion, each with real games behind it.
    const classesWithGames = [...byClass.entries()].filter(([, e]) => e.games >= 10);
    if (classesWithGames.length >= 3 && proven.length >= 5) {
      tags.push({ key: "versatile", label: "Versatile Pool", kind: "playstyle", family: "versatility", reason: `Proven on ${classesWithGames.map(([c]) => c.toLowerCase()).join(", ")} champions (${proven.length} champions rated Strong or better).`, weight: 2.15, specific: true });
    }
  }

  // What the configured pool is built for (describes their choices; weaker than proven experience).
  const configured = input.champions.filter((c) => c.role === input.primaryRole);
  if (configured.length >= 3) {
    const engage = configured.filter((c) => c.traits.engage >= 2);
    if (engage.length / configured.length >= 0.6) tags.push({ key: "pool-engage", label: "Engage-Focused Pool", kind: "playstyle", family: "trait-engage", reason: `From their configured ${ROLE_LABELS[input.primaryRole]} pool: ${list(engage.map((c) => c.name))} all start fights.`, weight: 1.55 });
  }
  const frontlineRoles = new Set(input.champions.filter((c) => c.traits.frontline >= 2).map((c) => c.role));
  if (frontlineRoles.size >= 2) tags.push({ key: "pool-frontline-flex", label: "Frontline Flexibility", kind: "playstyle", family: "trait-frontline", reason: `Configured frontline champions in ${[...frontlineRoles].map((r) => ROLE_LABELS[r]).join(" and ")}.`, weight: 1.5, specific: true });

  // Measured performance this season (enough games, clear threshold, 5% grace for held tags).
  const p = input.performance;
  if (p) {
    const th = thresholds(input.primaryRole);
    const ok = (key: string, value: number | null, threshold: number) => value !== null && Number.isFinite(threshold) && value >= (held.has(key) ? threshold * 0.95 : threshold);
    if (p.games >= MIN_GAMES.performance && ok("form", p.winRate, th.winRate)) tags.push({ key: "form", label: "Strong Season Form", kind: "performance", family: "form", reason: `${Math.round((p.winRate ?? 0) * 100)}% win rate over ${p.games} games on pool champions this season.`, weight: 2.6 });
    if (p.detailedGames >= MIN_GAMES.detailed && ok("kda", p.kdaRatio, th.kda)) tags.push({ key: "kda", label: "Efficient KDA", kind: "performance", family: "kda", reason: `${p.kdaRatio!.toFixed(1)} KDA ratio over ${p.detailedGames} games this season.`, weight: 2.4 });
    if (p.csGames >= MIN_GAMES.detailed && ok("cs", p.csPerMinute, th.csPerMinute)) tags.push({ key: "cs", label: "Consistent Farmer", kind: "performance", family: "cs", reason: `${p.csPerMinute!.toFixed(1)} CS per minute over ${p.csGames} games this season.`, weight: 2.3 });
    if (p.visionGames >= MIN_GAMES.detailed && ok("vision", p.visionPerGame, th.vision)) tags.push({ key: "vision", label: "Vision Focused", kind: "performance", family: "vision", reason: `${Math.round(p.visionPerGame!)} vision score per game over ${p.visionGames} games this season.`, weight: 2.3 });
  }
  // Tags shown last time are kept unless something clearly better appears (no flicker).
  for (const t of tags) if (held.has(t.key)) t.weight += 0.4;
  return tags.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
}

/** Up to three tags: strongest first, one per family, a measured tag alongside two playstyle ones when available. */
function choose(tags: Candidate[], avoid: (t: Candidate) => number = () => 0): Candidate[] {
  const ranked = [...tags].sort((a, b) => b.weight - avoid(b) - (a.weight - avoid(a)) || a.key.localeCompare(b.key));
  const out: Candidate[] = [];
  const families = new Set<string>();
  const take = (pool: Candidate[], max: number) => {
    for (const t of pool) {
      if (out.length >= max) break;
      if (families.has(t.family)) continue;
      families.add(t.family);
      out.push(t);
    }
  };
  const perf = ranked.filter((t) => t.kind === "performance");
  const play = ranked.filter((t) => t.kind === "playstyle");
  if (perf[0] && play.length >= 2) {
    take(play, MAX_TAGS - 1);
    take(perf, MAX_TAGS);
  } else take(ranked, MAX_TAGS);
  return out;
}

const finish = (t: Candidate, label = t.label): PlayerTag => ({ key: t.key, label, kind: t.kind, reason: t.reason });

function neutralTags(input: TagInput): PlayerTag[] {
  const neutral: PlayerTag[] = [{ key: "role", label: `${ROLE_LABELS[input.primaryRole]} Main`, kind: "neutral", reason: "Their primary role. Strength tags appear as Riot data shows proven champions." }];
  if (input.roles.length >= 2) neutral.push({ key: "roles", label: `Also ${input.roles.slice(1, 3).map((r) => ROLE_LABELS[r]).join(" / ")}`, kind: "neutral", reason: "Other configured roles." });
  return neutral;
}

/** Strength tags for one player on their own (no teammates to tell apart). */
export function strengthTags(input: TagInput): PlayerTag[] {
  return teamStrengthTags([input])[0]!;
}

/**
 * Strength tags for a whole lineup, chosen together so they tell players apart without
 * inventing anything:
 *   1. each player's tags are chosen from their own evidence;
 *   2. a generic tag that teammates also show is reworded to its role-qualified form when there
 *      is one ("Proven Fighter" → "Top-Lane Skirmisher": same evidence);
 *   3. a generic tag still shared is pushed down so a specific, true alternative of that player
 *      (a champion, breadth, a measured strength) can take its place. With no such alternative
 *      the shared tag stays: accuracy wins over uniqueness.
 */
export function teamStrengthTags(inputs: TagInput[]): PlayerTag[][] {
  const all = inputs.map(candidates);
  let picks = all.map((c) => choose(c));
  // Generic labels shown by more than one player.
  const shared = () => {
    const count = new Map<string, number>();
    for (const list of picks) for (const t of new Set(list.map((x) => x.label))) count.set(t, (count.get(t) ?? 0) + 1);
    return count;
  };
  if (inputs.length > 1) {
    const before = shared();
    picks = all.map((c) => choose(c, (t) => ((before.get(t.label) ?? 0) > 1 && !t.specific && !t.alt ? 0.9 : 0)));
  }
  const after = shared();
  return picks.map((list, i) => {
    if (list.length === 0) return neutralTags(inputs[i]!);
    return list.map((t) => finish(t, (after.get(t.label) ?? 0) > 1 && t.alt ? t.alt : t.label));
  });
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
