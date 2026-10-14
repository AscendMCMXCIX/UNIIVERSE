import { ROLE_LABELS, type Role } from "./roles";
import type { ChampionTraits, TraitKey } from "./champion-model/traits";
import type { ProficiencyTier } from "./proficiency";

/*
  Strength tags on Team cards: up to three short, positive labels that say what this player
  brings to the role they hold in the lineup.

  Everything is about that ASSIGNED role, not their usual one: a Top main put in the Jungle is
  described by their Jungle pool and their Jungle games. Their own profile still shows their
  role preferences.

  Most specific first, never invented:
    1. their champion identity in the role: a signature champion ("Gwen Specialist") or a pair;
    2. the style of the champions they are PROVEN on in the role (Comfortable or Main proficiency,
       with games in that role): "Top-Lane Skirmisher", "Engage Jungler";
    3. depth and range in the role, and how their experience compares with the rest of the
       lineup ("Most Experienced in Lineup");
    4. measured results this season in the role, with enough games behind them;
    5. what their configured pool for the role is built for ("Engage-Oriented Jungle Pool"):
       a description of their choices, used when proven experience is thin.
  Nothing is said about laning, macro, decision-making or teamfighting: game statistics do not
  show those, and choosing a champion is not proof of skill.

  Stability: tags already shown get a small bonus and performance tags keep a 5% grace below
  their threshold, so one or two games never flip them; every tag needs a minimum sample.
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
  /** Data Dragon classes ("Fighter", "Tank", ...). */
  classes: string[];
  traits: ChampionTraits;
  /** Proficiency on this champion in the assigned role. */
  tier: ProficiencyTier;
  /** Games on record in the assigned role (games whose position Riot did not record are shared out pro rata). */
  roleGames: number;
  /** Games on record in every role. */
  games: number;
}

export interface TagPerformance {
  /** Games this season in the assigned role (every champion, all supported modes). */
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
  /** The role the tags describe: the player's lineup role (their primary role off the lineup). */
  role: Role;
  /** Their own primary role (context only: a flex pick is said to be one). */
  primaryRole: Role | null;
  /** Their configured pool for `role`, in preference order. */
  champions: TagChampion[];
  performance: TagPerformance | null;
  /** Keys of the tags shown last time (for stability). */
  previous?: string[];
}

export const MIN_GAMES = { performance: 30, detailed: 20, provenChampion: 6 } as const;
const PROVEN: ProficiencyTier[] = ["core", "strong"];
const MAX_TAGS = 3;

/** How a player in the role is called ("Jungler", "Top Laner"). */
const ROLE_NOUN: Record<Role, string> = { TOP: "Top Laner", JUNGLE: "Jungler", MID: "Mid Laner", ADC: "Bot Laner", SUPPORT: "Support" };

const CLASSES = ["Fighter", "Tank", "Mage", "Assassin", "Marksman", "Support"] as const;

/** Champion classes said the way players say them in each role. */
const CLASS_IN_ROLE: Record<string, Partial<Record<Role, string>>> = {
  Fighter: { TOP: "Top-Lane Skirmisher", JUNGLE: "Bruiser Jungler", MID: "Mid-Lane Fighter", ADC: "Fighter Bot Laner", SUPPORT: "Fighter Support" },
  Tank: { TOP: "Top-Lane Tank", JUNGLE: "Tank Jungler", MID: "Mid-Lane Tank", SUPPORT: "Tank Support" },
  Mage: { TOP: "Top-Lane Mage", JUNGLE: "Mage Jungler", MID: "Control Mage", ADC: "Mage Bot Laner", SUPPORT: "Mage Support" },
  Assassin: { TOP: "Top-Lane Assassin", JUNGLE: "Assassin Jungler", MID: "Mid-Lane Assassin", SUPPORT: "Assassin Support" },
  // A marksman in the bot lane is the norm, not an identity: no class tag for it.
  Marksman: { TOP: "Top-Lane Marksman", MID: "Mid-Lane Marksman" },
  Support: { SUPPORT: "Enchanter Support", MID: "Utility Mid Laner", TOP: "Utility Top Laner" },
};

/** Playstyle traits of proven champions, said for the role. */
const TRAIT_TAGS: Array<{ trait: TraitKey; key: string; what: string; inRole: Partial<Record<Role, string>>; generic: string }> = [
  { trait: "engage", key: "engage", what: "engage", generic: "Engage Specialist", inRole: { TOP: "Engage Top Laner", JUNGLE: "Engage Jungler", MID: "Engage Mid Laner", SUPPORT: "Engage Support" } },
  { trait: "frontline", key: "frontline", what: "a frontline", generic: "Reliable Frontline", inRole: { TOP: "Frontline Top Laner", JUNGLE: "Frontline Jungler", SUPPORT: "Frontline Support" } },
  { trait: "peel", key: "peel", what: "protection for carries", generic: "Protects the Carries", inRole: { SUPPORT: "Carry Protector", ADC: "Self-Peel Marksman", MID: "Peel-Focused Mid Laner" } },
  { trait: "scaling", key: "scaling", what: "late-game scaling", generic: "Late-Game Carry", inRole: { TOP: "Late-Game Top Carry", JUNGLE: "Scaling Jungler", MID: "Late-Game Mid Carry", ADC: "Hyper-Carry Marksman", SUPPORT: "Scaling Support" } },
  { trait: "earlyGame", key: "early", what: "early-game pressure", generic: "Early Pressure", inRole: { TOP: "Early-Pressure Top Laner", JUNGLE: "Early-Game Ganker", MID: "Early-Pressure Mid Laner", ADC: "Early-Pressure Marksman", SUPPORT: "Aggressive Lane Support" } },
  { trait: "pick", key: "pick", what: "catch potential", generic: "Pick Threat", inRole: { JUNGLE: "Pick-Off Jungler", MID: "Pick-Off Mid Laner", SUPPORT: "Hook & Pick Support" } },
  { trait: "sideLane", key: "splitpush", what: "side-lane pressure", generic: "Side-Lane Pressure", inRole: { TOP: "Split-Push Top Laner", MID: "Side-Lane Mid Laner" } },
];

/** What a configured pool for the role is built for (a description of choices, not of skill). */
const POOL_SHAPES: Array<{ key: string; label: (role: string) => string; test: (c: TagChampion) => boolean; what: string }> = [
  { key: "engage", label: (r) => `Engage-Oriented ${r} Pool`, test: (c) => c.traits.engage >= 2, what: "start fights" },
  { key: "frontline", label: (r) => `Frontline ${r} Pool`, test: (c) => c.traits.frontline >= 2, what: "hold the front line" },
  { key: "scaling", label: (r) => `Scaling ${r} Pool`, test: (c) => c.traits.scaling >= 2, what: "scale into the late game" },
  { key: "early", label: (r) => `Early-Game ${r} Pool`, test: (c) => c.traits.earlyGame >= 2, what: "press early" },
  { key: "ap", label: (r) => `AP ${r} Pool`, test: (c) => c.traits.magicDamage >= 2 && c.traits.magicDamage > c.traits.physicalDamage, what: "deal magic damage" },
];

/** Performance thresholds by role (a support's CS or a marksman's vision are judged fairly). */
function thresholds(role: Role) {
  return {
    winRate: 0.55,
    kda: role === "SUPPORT" ? 3.8 : 3.3,
    csPerMinute: role === "JUNGLE" ? 6.6 : role === "SUPPORT" ? Infinity : 7.6,
    vision: role === "SUPPORT" ? 70 : role === "JUNGLE" ? 40 : 28,
  };
}

const list = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A possible tag with how strongly the evidence supports it. */
interface Candidate extends PlayerTag {
  weight: number;
  /** Tags of one family never appear together (one class description, one signature champion…). */
  family: string;
  /** Specific tags (a champion, breadth, a comparison) beat generic ones a teammate shares. */
  specific?: boolean;
}

/** Everything a player has proven in the role, for tags and team comparisons. */
function provenIn(input: TagInput) {
  const proven = input.champions.filter((c) => PROVEN.includes(c.tier) && c.roleGames >= MIN_GAMES.provenChampion).sort((a, b) => b.roleGames - a.roleGames || a.name.localeCompare(b.name));
  return { proven, games: proven.reduce((s, c) => s + c.roleGames, 0) };
}

/** Every tag the evidence supports for one player in their assigned role, strongest first. */
function candidates(input: TagInput): Candidate[] {
  const tags: Candidate[] = [];
  const role = input.role;
  const R = ROLE_LABELS[role];
  const held = new Set(input.previous ?? []);
  const { proven, games: provenGames } = provenIn(input);

  if (provenGames > 0) {
    // 1. Champion identity: one signature champion, or two that share the role between them.
    const [first, second] = proven;
    const pair = first && second && first.tier === "core" && second.tier === "core" && first.roleGames >= 25 && second.roleGames >= 25 && second.roleGames / provenGames >= 0.25 && `${first.name} & ${second.name}`.length <= 20;
    if (pair) {
      tags.push({ key: `signature-${first.championId}-${second.championId}`, label: `${first.name} & ${second.name}`, kind: "playstyle", family: "signature", reason: `${first.roleGames} ${R} games on ${first.name} and ${second.roleGames} on ${second.name}, both played as mains.`, weight: 3.1 + (first.roleGames + second.roleGames) / 600, specific: true });
    } else if (first && first.tier === "core" && first.roleGames >= 40) {
      tags.push({ key: `signature-${first.championId}`, label: `${first.name} Specialist`, kind: "playstyle", family: "signature", reason: `${first.roleGames} ${R} games on ${first.name}, a main played recently.`, weight: 3 + first.roleGames / 400, specific: true });
    } else if (first && first.roleGames >= 20 && first.roleGames / provenGames >= 0.4) {
      tags.push({ key: `signature-${first.championId}`, label: `${first.name} Comfort Pick`, kind: "playstyle", family: "signature", reason: `${first.roleGames} ${R} games on ${first.name}, ${Math.round((first.roleGames / provenGames) * 100)}% of their proven ${R} experience.`, weight: 2.6 + first.roleGames / 400, specific: true });
    }
    // Champions they main in the role (proficiency "Main", 15+ games here) that the signature tag
    // does not already name: individual by nature, so teammates are told apart.
    const named = new Set(tags.flatMap((t) => (t.family === "signature" ? t.key.replace("signature-", "").split("-") : [])));
    for (const c of proven.filter((x) => x.tier === "core" && x.roleGames >= 15 && !named.has(x.championId)).slice(0, 2)) {
      tags.push({ key: `main-${c.championId}`, label: `${c.name} Main`, kind: "playstyle", family: `main-${c.championId}`, reason: `${c.roleGames} ${R} games on ${c.name}, played recently: rated Main in ${R}.`, weight: 2.7 + c.roleGames / 500, specific: true });
    }

    // 2. Style: the class most of their proven games in the role are on, said for the role.
    const byClass = new Map<string, TagChampion[]>();
    for (const c of proven) {
      const cls = CLASSES.find((k) => c.classes.includes(k));
      if (cls) byClass.set(cls, [...(byClass.get(cls) ?? []), c]);
    }
    const classGames = (l: TagChampion[]) => l.reduce((s, c) => s + c.roleGames, 0);
    const best = [...byClass.entries()].sort((a, b) => classGames(b[1]) - classGames(a[1]))[0];
    const ordinary = best && best[0] === "Marksman" && role === "ADC";
    if (best && !ordinary && classGames(best[1]) >= 30 && classGames(best[1]) / provenGames >= 0.5) {
      const [cls, champs] = best;
      const g = classGames(champs);
      const ap = champs.filter((c) => c.traits.magicDamage >= 2 && c.traits.magicDamage > c.traits.physicalDamage);
      const apShare = classGames(ap) / g;
      const label = (cls === "Fighter" || cls === "Assassin" || cls === "Tank") && ap.length >= 2 && apShare >= 0.6 ? `AP ${cls} ${ROLE_NOUN[role]}` : (CLASS_IN_ROLE[cls]?.[role] ?? `${cls} ${ROLE_NOUN[role]}`);
      tags.push({ key: `class-${cls.toLowerCase()}`, label, kind: "playstyle", family: "class", reason: `${g} ${R} games on ${cls.toLowerCase()} champions they are comfortable on (${list(champs.map((c) => c.name))}).`, weight: 2.2 + 0.6 * (g / provenGames) });
    }
    // Playstyle traits weighted by proven games in the role.
    for (const t of TRAIT_TAGS) {
      const on = proven.filter((c) => c.traits[t.trait] >= 2);
      const games = on.reduce((s, c) => s + c.roleGames, 0);
      if (games >= 25 && games / provenGames >= 0.45) {
        tags.push({ key: t.key, label: t.inRole[role] ?? t.generic, kind: "playstyle", family: `trait-${t.key}`, reason: `Most of their proven ${R} experience brings ${t.what} (${list(on.map((c) => c.name))}).`, weight: 2 + games / provenGames });
      }
    }

    // 3. Depth and range in the role.
    if (proven.length >= 4) tags.push({ key: "deep-pool", label: `Deep ${R} Pool`, kind: "playstyle", family: "breadth", reason: `${proven.length} ${R} champions they are Comfortable or better on.`, weight: 2.2, specific: true });
    const classesWithGames = [...byClass.entries()].filter(([, l]) => classGames(l) >= 10);
    if (classesWithGames.length >= 3) tags.push({ key: "versatile", label: `Versatile ${ROLE_NOUN[role]}`, kind: "playstyle", family: "versatility", reason: `Proven on ${classesWithGames.map(([c]) => c.toLowerCase()).join(", ")} champions in ${R}.`, weight: 2.15, specific: true });
  }

  // 4. Measured results this season in the role (enough games, clear threshold, 5% grace for held tags).
  const p = input.performance;
  if (p) {
    const th = thresholds(role);
    const ok = (key: string, value: number | null, threshold: number) => value !== null && Number.isFinite(threshold) && value >= (held.has(key) ? threshold * 0.95 : threshold);
    if (p.games >= MIN_GAMES.performance && ok("form", p.winRate, th.winRate)) tags.push({ key: "form", label: `Strong ${R} Form`, kind: "performance", family: "form", reason: `${Math.round((p.winRate ?? 0) * 100)}% win rate over ${p.games} ${R} games this season.`, weight: 2.6 });
    if (p.detailedGames >= MIN_GAMES.detailed && ok("kda", p.kdaRatio, th.kda)) tags.push({ key: "kda", label: "Efficient KDA", kind: "performance", family: "kda", reason: `${p.kdaRatio!.toFixed(1)} KDA ratio over ${p.detailedGames} ${R} games this season.`, weight: 2.4 });
    if (p.csGames >= MIN_GAMES.detailed && ok("cs", p.csPerMinute, th.csPerMinute)) tags.push({ key: "cs", label: "Consistent Farmer", kind: "performance", family: "cs", reason: `${p.csPerMinute!.toFixed(1)} CS per minute over ${p.csGames} ${R} games this season.`, weight: 2.3 });
    if (p.visionGames >= MIN_GAMES.detailed && ok("vision", p.visionPerGame, th.vision)) tags.push({ key: "vision", label: "Vision Focused", kind: "performance", family: "vision", reason: `${Math.round(p.visionPerGame!)} vision score per game over ${p.visionGames} ${R} games this season.`, weight: 2.3 });
  }

  // 5. What the configured pool for the role is built for (their choices; weaker than proof).
  const pool = input.champions;
  if (pool.length >= 3) {
    for (const shape of POOL_SHAPES) {
      const on = pool.filter(shape.test);
      if (on.length / pool.length >= 0.6) tags.push({ key: `pool-${shape.key}`, label: shape.label(R), kind: "playstyle", family: `pool-${shape.key}`, reason: `From their ${R} pool: ${list(on.map((c) => c.name))} ${on.length === 1 ? "is built" : "are built"} to ${shape.what}.`, weight: 1.4 + on.length / pool.length / 10 });
    }
  }

  // Tags shown last time are kept unless something clearly better appears (no flicker).
  for (const t of tags) if (held.has(t.key)) t.weight += 0.4;
  return tags.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
}

const finish = (t: Candidate): PlayerTag => ({ key: t.key, label: t.label, kind: t.kind, reason: t.reason });

/** Nothing proven or measured yet: describe the role and the pool, nothing more. */
function neutralTags(input: TagInput): PlayerTag[] {
  const R = ROLE_LABELS[input.role];
  const out: PlayerTag[] = [];
  const names = input.champions.map((c) => c.name);
  if (names.length === 0) out.push({ key: "pool-empty", label: `${R} Pool Not Set`, kind: "neutral", reason: `No ${R} champions configured yet.` });
  else out.push({ key: "pool-names", label: names.length <= 2 && names.join(" & ").length <= 22 ? `${names.join(" & ")} ${R}` : `${plural(names.length, `${R} champion`)}`, kind: "neutral", reason: `Their ${R} pool: ${names.join(", ")}. Strength tags appear as Riot data shows proven champions in this role.` });
  if (input.primaryRole && input.primaryRole !== input.role) out.push({ key: "flex-from", label: `Flex from ${ROLE_LABELS[input.primaryRole]}`, kind: "neutral", reason: `Usually plays ${ROLE_LABELS[input.primaryRole]}; holds ${R} in this lineup.` });
  return out;
}

/** Strength tags for one player on their own (no teammates to compare with). */
export function strengthTags(input: TagInput): PlayerTag[] {
  return teamStrengthTags([input])[0]!;
}

/**
 * Strength tags for a whole lineup, chosen together so every card says something different:
 *   1. each player's candidates come from their own evidence in their assigned role;
 *   2. comparisons only one player can win are added where the evidence is clear: the most
 *      proven experience in their role, the best win rate, the most games, the deepest proven pool;
 *   3. tags are handed out strongest first across the whole lineup, and a label already on a
 *      teammate's card is never repeated: the next true tag of that player takes its place. A
 *      player left with nothing proven gets the neutral description of their role pool.
 */
export function teamStrengthTags(inputs: TagInput[]): PlayerTag[][] {
  const all = inputs.map(candidates);
  if (inputs.length > 1) addLineupComparisons(inputs, all);
  const picks: Candidate[][] = inputs.map(() => []);
  const families = inputs.map(() => new Set<string>());
  const used = new Set<string>();
  // Players with fewer options choose first among equals, so a common tag goes where it is the
  // only thing that can be said.
  const queue = all
    .flatMap((list, i) => list.map((t) => ({ t, i, options: list.length })))
    .sort((a, b) => b.t.weight - a.t.weight || a.options - b.options || a.i - b.i || a.t.key.localeCompare(b.t.key));
  for (const { t, i } of queue) {
    if (picks[i]!.length >= MAX_TAGS || families[i]!.has(t.family) || used.has(t.label)) continue;
    picks[i]!.push(t);
    families[i]!.add(t.family);
    used.add(t.label);
  }
  return picks.map((list, i) => (list.length === 0 ? neutralTags(inputs[i]!) : list.sort((a, b) => b.weight - a.weight).map(finish)));
}

/** Lineup comparisons with a single, clear winner (nothing when it is close). */
function addLineupComparisons(inputs: TagInput[], all: Candidate[][]) {
  const add = (values: Array<number | null>, min: number, ratio: number, make: (i: number, best: number, next: number) => Candidate) => {
    const order = values.map((v, i) => ({ v: v ?? -Infinity, i })).sort((a, b) => b.v - a.v);
    const [top, next] = order;
    if (!top || !next || top.v < min || !Number.isFinite(top.v)) return;
    if (ratio > 1 ? top.v < Math.max(next.v, 0) * ratio : top.v - next.v < ratio) return;
    const tag = make(top.i, top.v, Math.max(next.v, 0));
    if (inputs[top.i]!.previous?.includes(tag.key)) tag.weight += 0.4;
    all[top.i]!.push(tag);
  };
  const R = (i: number) => ROLE_LABELS[inputs[i]!.role];
  add(inputs.map((x) => provenIn(x).games), 60, 1.5, (i, g, n) => ({ key: "most-experienced", label: "Most Experienced in Lineup", kind: "playstyle", family: "team-experience", reason: `${g} games on proven ${R(i)} champions, the most in the lineup (next: ${n}).`, weight: 2.5, specific: true }));
  // Win rate: only among players with a full sample, and a clear 3-point lead.
  const rates = inputs.map((x) => (x.performance && x.performance.games >= MIN_GAMES.performance ? x.performance.winRate : null));
  if (rates.filter((r) => r !== null).length >= 2)
    add(rates, 0.52, 0.03, (i, w, n) => ({ key: "best-form", label: "Best Form in Lineup", kind: "performance", family: "team-form", reason: `${Math.round(w * 100)}% win rate over ${inputs[i]!.performance!.games} ${R(i)} games this season, the best in the lineup (next: ${Math.round(n * 100)}%).`, weight: 2.42, specific: true }));
  add(inputs.map((x) => x.performance?.games ?? null), 50, 1.3, (i, g, n) => ({ key: "most-active", label: "Most Active in Lineup", kind: "performance", family: "team-volume", reason: `${g} ${R(i)} games this season, the most in the lineup (next: ${n}).`, weight: 2.2, specific: true }));
  add(inputs.map((x) => provenIn(x).proven.length), 4, 1.5, (i, c, n) => ({ key: "deepest-pool", label: "Deepest Pool in Lineup", kind: "playstyle", family: "breadth", reason: `${c} ${R(i)} champions they are Comfortable or better on, the most in the lineup (next: ${n}).`, weight: 2.3, specific: true }));
  for (const list of all) list.sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
}

/** A stable fingerprint of the evidence behind the tags (recompute only when it changes). */
export function tagInputsHash(input: TagInput): string {
  const p = input.performance;
  const bucket = (v: number | null, step: number) => (v === null ? "-" : String(Math.round(v / step)));
  const parts = [
    input.role,
    input.primaryRole ?? "-",
    input.champions.map((c) => `${c.championId}:${c.tier}:${Math.floor(c.roleGames / 5)}`).join("|"),
    p ? [Math.floor(p.games / 5), bucket(p.winRate, 0.01), Math.floor(p.detailedGames / 5), bucket(p.kdaRatio, 0.1), bucket(p.csPerMinute, 0.1), bucket(p.visionPerGame, 1)].join(",") : "none",
  ];
  let h = 2166136261;
  for (const ch of parts.join("#")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36);
}
