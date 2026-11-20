import { QUEUE_GROUP_WORDS, type FigureComparison, type FigureKey, type GoldPoint, type LaneMoment, type PersonalComparison } from "./match-analysis";
import type { TimelineObjective } from "./match-events";
import type { GameRole } from "./season-stats";
import { ROLE_LABELS } from "./roles";
import { formatCount } from "@/lib/format";

/*
  MATCH NOTES: what one game says, in a few short sentences under three headings: Went well, Went
  wrong and Focus next. Every note is a rule (docs/MATCH_NOTES.md is the table of them): a fact with
  its numbers and what it was compared with (the lane opponent, the player's team, or their own
  earlier games of the same role and queue group). The hard rules:
  1. a fact, its numbers and its comparison base, never a cause or a verdict (REFUSED_WORDS);
  2. at most MAX_WORDS words a sentence;
  3. champions are named, never other players;
  4. a rule whose data is missing says nothing (no guess, nothing read into final items);
  5. the checkpoints are times ("at 10 minutes"), never a phase of the game;
  6. remakes are not analysed;
  7. worded for the viewer: "you" and "your" on the viewer's own game, the champion's name and
     "their" on a teammate's;
  8. Focus next only on the viewer's own game: on a teammate's it would be one member coaching
     another unasked.
  The game's result does not bias the choice: a Defeat can have Went well notes and a Victory Went
  wrong ones.
*/

/** Words no note may contain: causes and verdicts the data cannot support. Whole words, any case. */
export const REFUSED_WORDS = ["because", "due to", "caused", "led to", "thanks to", "cost", "should have", "mistake", "good", "bad", "great", "poor", "terrible", "feed", "fed", "int", "carry", "throw", "threw", "laning phase"] as const;
export const MAX_WORDS = 20;

/** The lane at 10 minutes: a CS or gold difference at least this large is said. */
export const LANE_CS_MIN = 10;
export const LANE_GOLD_MIN = 500;
/** Between 10 and 15 minutes: a lead that grows or falls by at least this much. */
export const LANE_SWING_MIN = 500;
/** "Fell" needs a lead of at least this much at 10 minutes. */
export const LANE_LEAD_MIN = 300;
/** The bot lane's two against two at 10 minutes. */
export const PAIR_GOLD_MIN = 800;
/** Deaths before 10 minutes. */
export const EARLY_DEATHS_MIN = 2;
export const EARLY_MINUTE = 10;
/** The most deaths on the team, and at least this many. */
export const MANY_DEATHS_MIN = 7;
/** Few deaths in a long game. */
export const FEW_DEATHS_MAX = 2;
export const FEW_DEATHS_GAME_MIN = 25;
/** Against the player's usual: the top and bottom fifths. */
export const HIGH_PERCENTILE = 0.8;
export const LOW_PERCENTILE = 0.2;
/** Focus next falls back on the lowest figure at or below this. */
export const FOCUS_PERCENTILE = 0.35;
/** The most damage on the team, and at least this share. */
export const DAMAGE_SHARE_MIN = 0.25;
/** Towers: at least this many takedowns and this share of the team's. */
export const TOWERS_MIN = 3;
export const TOWER_SHARE_MIN = 0.4;
/** No control ward in a game this long. */
export const CONTROL_WARD_GAME_MIN = 20;
export const SOLO_KILLS_MIN = 2;
export const MULTIKILL_MIN = 3;
/** The team's gold: won from this far behind, or lost after leading by this much. */
export const TEAM_GOLD_SWING = 3_000;
/** The jungle's objectives before this minute, at least this many in all, and these shares. */
export const JUNGLE_MINUTE = 15;
export const JUNGLE_OBJECTIVES_MIN = 3;
export const JUNGLE_HIGH = 0.75;
export const JUNGLE_LOW = 0.25;
/** At most this many notes in each of Went well and Went wrong. */
export const PER_SECTION = 2;

export type NoteId = "L1" | "L2" | "L3" | "L4" | "L5" | "D1" | "D2" | "D3" | "P1" | "P2" | "P3" | "K1" | "T1" | "T2" | "T3" | "V1" | "S1" | "M1" | "G1" | "G2" | "J1";
export type NoteTopic = "lane" | "lane-swing" | "deaths" | "kda" | "cs" | "damage" | "vision" | "teamplay" | "objectives" | "highlight" | "team";
export type FocusKind = "lane" | "early-deaths" | "deaths" | "vision" | "cs" | "damage" | "teamplay";

export interface Note {
  id: NoteId;
  section: "well" | "wrong";
  topic: NoteTopic;
  /** How far past its threshold, 0–1; the strongest notes are chosen. */
  strength: number;
  text: string;
  /** What Focus next says when this is the strongest Went wrong note. */
  focus?: FocusKind;
}

export interface NotesInput {
  /** The viewer's own game ("you"), or a teammate's (the champion's name). */
  own: boolean;
  /** The player's champion, as written. */
  champion: string;
  role: GameRole | null;
  queueId: number | null;
  durationS: number;
  win: boolean;
  /** A game ended early by a remake: never analysed. */
  remake?: boolean;
  me: {
    kills: number;
    deaths: number;
    assists: number;
    damageShare: number | null;
    vision: number | null;
    killParticipation: number | null;
    /** Extra figures (absent on older records: their rules say nothing). */
    controlWardsBought?: number | null;
    soloKills?: number | null;
    largestMultiKill?: number | null;
    turretTakedowns?: number | null;
  };
  /** The player's teammates (not the player), and every player of the other team. */
  allies: Array<{ deaths: number; damageShare: number | null; vision: number | null }>;
  /**
   * Teammates whose data was erased (stored without their figures, so not in `allies`): a claim
   * about the whole team ("the most on your team") needs every seat, so it says nothing then.
   */
  alliesRemoved: number;
  enemies: Array<{ vision: number | null }>;
  /** The player's team's towers; null when not recorded. */
  teamTowers: number | null;
  /** The lane opponent's champion, when there is exactly one. */
  opponent: string | null;
  /** The player and the lane opponent at 10:00 and 15:00 (timeline). */
  lane: LaneMoment[] | null;
  /** The bot lane, two against two at 10:00 (timeline): the partner's champion, theirs, and the pair's gold difference. */
  pair: { ally: string; opponents: [string, string]; gold: number } | null;
  /** The player's own earlier games of the same role and queue group. */
  personal: PersonalComparison | null;
  /** The player's death times, in minutes (timeline). */
  deathTimes: number[] | null;
  /** The two teams' gold difference over the game, from the player's side (timeline, checked against the record). */
  gold: GoldPoint[] | null;
  /** Objectives taken, from the player's side (timeline). */
  objectives: TimelineObjective[] | null;
}

export interface MatchNotes {
  well: Note[];
  wrong: Note[];
  /** One suggestion, on the viewer's own game only. */
  focus: { kind: FocusKind; text: string; /** The Went wrong note it follows (L2, L4, L5…), or null when it follows a low figure. */ cue: string | null } | null;
  /** One honest line when there is nothing to say, or no baseline yet. */
  fallback: string | null;
}

/** How a sentence names the player: "you" on one's own game, the champion and "their" on a teammate's. */
export function viewerWords(own: boolean, champion: string) {
  return own
    ? { Subject: "You", subject: "you", Possessive: "Your", possessive: "your", their: "your", Their: "Your", had: "You had" }
    : { Subject: champion, subject: champion, Possessive: `${champion}'s`, possessive: `${champion}'s`, their: "their", Their: "Their", had: `${champion} had` };
}

const n = (v: number) => formatCount(Math.round(Math.abs(v)));
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const past = (value: number, threshold: number) => clamp((Math.abs(value) - threshold) / Math.max(1, threshold));
const clock = (minute: number) => {
  const s = Math.max(0, Math.round(minute * 60));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const FIGURE_TOPIC: Partial<Record<FigureKey, NoteTopic>> = { kda: "kda", csPerMin: "cs", damagePerMin: "damage", visionPerMin: "vision", killParticipation: "teamplay" };
const FIGURE_FOCUS: Partial<Record<FigureKey, FocusKind>> = { kda: "deaths", csPerMin: "cs", damagePerMin: "damage", visionPerMin: "vision", killParticipation: "teamplay" };

function figureWords(f: FigureComparison, value: number): string {
  if (f.key === "killParticipation") return `${Math.round(value * 100)}%`;
  if (f.key === "damagePerMin" || f.key === "goldPerMin") return formatCount(Math.round(value));
  if (f.key === "damageShare") return `${Math.round(value * 100)}%`;
  return value.toFixed(f.key === "csPerMin" ? 1 : 2);
}

/** "ranked Top games", "Swiftplay and Quickplay Mid games". */
function sampleWords(p: PersonalComparison): string {
  const q = QUEUE_GROUP_WORDS[p.group];
  return `${q ? `${q} ` : ""}${ROLE_LABELS[p.role]} games`;
}

/** Every note that fires, unsorted. */
export function firingNotes(x: NotesInput): Note[] {
  const w = viewerWords(x.own, x.champion);
  const out: Note[] = [];
  const minutes = x.durationS / 60;
  const support = x.role === "SUPPORT";

  // The lane at 10 and 15 minutes (L1–L4), against the one lane opponent.
  const at = (m: number) => x.lane?.find((l) => l.minute === m);
  const ten = at(10);
  if (x.opponent && ten?.you && ten.opponent) {
    const cs = ten.you.cs - ten.opponent.cs;
    const gold = ten.you.gold - ten.opponent.gold;
    for (const sign of [1, -1] as const) {
      const csFires = !support && sign * cs >= LANE_CS_MIN;
      const goldFires = sign * gold >= LANE_GOLD_MIN;
      if (!csFires && !goldFires) continue;
      const more = sign > 0 ? "more" : "fewer";
      const moreGold = sign > 0 ? "more" : "less";
      const text = csFires && goldFires ? `${w.had} ${n(cs)} ${more} CS and ${n(gold)} ${moreGold} gold than ${x.opponent} at 10 minutes.` : csFires ? `${w.had} ${n(cs)} ${more} CS than ${x.opponent} at 10 minutes (${ten.you.cs} to ${ten.opponent.cs}).` : `${w.had} ${n(gold)} ${moreGold} gold than ${x.opponent} at 10 minutes.`;
      out.push({ id: sign > 0 ? "L1" : "L2", section: sign > 0 ? "well" : "wrong", topic: "lane", strength: Math.max(csFires ? past(cs, LANE_CS_MIN) : 0, goldFires ? past(gold, LANE_GOLD_MIN) : 0), text, focus: sign < 0 ? "lane" : undefined });
    }
    const fifteen = at(15);
    if (fifteen?.you && fifteen.opponent) {
      const g10 = gold;
      const g15 = fifteen.you.gold - fifteen.opponent.gold;
      const swing = g15 - g10;
      if (swing >= LANE_SWING_MIN && g15 > 0)
        out.push({ id: "L3", section: "well", topic: "lane-swing", strength: past(swing, LANE_SWING_MIN), text: g10 >= 0 ? `${w.Possessive} gold lead over ${x.opponent} grew from ${n(g10)} to ${n(g15)} between 10 and 15 minutes.` : `${w.Subject} went from ${n(g10)} gold behind ${x.opponent} to ${n(g15)} ahead between 10 and 15 minutes.` });
      if (g10 >= LANE_LEAD_MIN && swing <= -LANE_SWING_MIN)
        out.push({ id: "L4", section: "wrong", topic: "lane-swing", strength: past(swing, LANE_SWING_MIN), text: g15 >= 0 ? `${w.Possessive} gold lead over ${x.opponent} fell from ${n(g10)} to ${n(g15)} between 10 and 15 minutes.` : `${w.Subject} went from ${n(g10)} gold ahead of ${x.opponent} to ${n(g15)} behind between 10 and 15 minutes.`, focus: "lane" });
    }
  }
  // The bot lane, two against two (L5).
  if (x.pair && (x.role === "ADC" || x.role === "SUPPORT") && Math.abs(x.pair.gold) >= PAIR_GOLD_MIN) {
    const ahead = x.pair.gold > 0;
    const who = x.own ? `You and ${x.pair.ally}` : `${x.champion} and ${x.pair.ally}`;
    out.push({ id: "L5", section: ahead ? "well" : "wrong", topic: "lane", strength: past(x.pair.gold, PAIR_GOLD_MIN), text: `${who} had ${n(x.pair.gold)} ${ahead ? "more" : "less"} gold than ${x.pair.opponents[0]} and ${x.pair.opponents[1]} at 10 minutes.`, focus: ahead ? undefined : "lane" });
  }

  // Deaths (D1–D3).
  const d = x.me.deaths;
  if (x.deathTimes) {
    const early = x.deathTimes.filter((t) => t < EARLY_MINUTE).length;
    if (early >= EARLY_DEATHS_MIN) out.push({ id: "D1", section: "wrong", topic: "deaths", strength: past(early, EARLY_DEATHS_MIN - 1), text: `${early} of ${w.possessive} ${d} deaths came before 10 minutes.`, focus: "early-deaths" });
  }
  if (d >= MANY_DEATHS_MIN && x.alliesRemoved === 0 && x.allies.length && x.allies.every((a) => a.deaths < d)) out.push({ id: "D2", section: "wrong", topic: "deaths", strength: past(d, MANY_DEATHS_MIN), text: `${d} deaths, the most on ${w.possessive} team.`, focus: "deaths" });
  if (d <= FEW_DEATHS_MAX && minutes >= FEW_DEATHS_GAME_MIN) out.push({ id: "D3", section: "well", topic: "deaths", strength: clamp((FEW_DEATHS_MAX + 1 - d) / (FEW_DEATHS_MAX + 1)), text: d === 0 ? `No deaths in ${Math.floor(minutes)} minutes.` : `Only ${d} ${d === 1 ? "death" : "deaths"} in ${Math.floor(minutes)} minutes.` });

  // Against the player's usual (P1–P3, K1).
  if (x.personal) {
    const sample = sampleWords(x.personal);
    for (const f of x.personal.figures) {
      const topic = FIGURE_TOPIC[f.key];
      if (!topic) continue;
      const id: NoteId = f.key === "killParticipation" ? "K1" : f.best ? "P1" : f.percentile >= HIGH_PERCENTILE ? "P2" : "P3";
      const value = figureWords(f, f.value);
      const usual = figureWords(f, f.median);
      const label = f.key === "killParticipation" ? "Kill participation" : f.label;
      if (f.best && f.key !== "killParticipation") out.push({ id, section: "well", topic, strength: 1, text: `${w.Possessive} highest ${label} in ${w.their} last ${f.games} ${sample} (${value}).` });
      else if (f.percentile >= HIGH_PERCENTILE) out.push({ id, section: "well", topic, strength: clamp((f.percentile - HIGH_PERCENTILE) / (1 - HIGH_PERCENTILE)), text: `${label} higher than in ${f.below >= f.games ? "all" : f.below} of ${w.their} last ${f.games} ${sample} (${value}; usually ${usual}).` });
      else if (f.percentile <= LOW_PERCENTILE) {
        // Earlier games with a higher value: neither below nor tied (percentile counts a tie half).
        const ties = Math.round((f.percentile * f.games - f.below) * 2);
        const above = f.games - f.below - ties;
        out.push({ id, section: "wrong", topic, strength: clamp((LOW_PERCENTILE - f.percentile) / LOW_PERCENTILE), text: `${label} lower than in ${above >= f.games ? "all" : Math.max(0, above)} of ${w.their} last ${f.games} ${sample} (${value}; usually ${usual}).`, focus: FIGURE_FOCUS[f.key] });
      }
    }
  }

  // Within the game (T1–T3, V1, S1, M1).
  const share = x.me.damageShare;
  if (!support && share !== null && share >= DAMAGE_SHARE_MIN && x.allies.every((a) => a.damageShare !== null && a.damageShare < share)) out.push({ id: "T1", section: "well", topic: "damage", strength: past(share, DAMAGE_SHARE_MIN), text: `The most damage to champions on ${w.possessive} team (${Math.round(share * 100)}% of it).` });
  const v = x.me.vision;
  const everyone = [...x.allies, ...x.enemies];
  if (v !== null && v > 0 && everyone.length === 9 && everyone.every((p) => p.vision !== null && p.vision < v)) out.push({ id: "T2", section: "well", topic: "vision", strength: 0.5, text: `The highest vision score in the game (${v}).` });
  const tt = x.me.turretTakedowns;
  if (typeof tt === "number" && x.teamTowers !== null && x.teamTowers > 0 && tt >= TOWERS_MIN && tt / x.teamTowers >= TOWER_SHARE_MIN) out.push({ id: "T3", section: "well", topic: "objectives", strength: clamp(tt / x.teamTowers - TOWER_SHARE_MIN), text: `${w.Subject} took part in ${Math.min(tt, x.teamTowers)} of ${w.possessive} team's ${x.teamTowers} towers.` });
  if (x.me.controlWardsBought === 0 && minutes >= CONTROL_WARD_GAME_MIN) out.push({ id: "V1", section: "wrong", topic: "vision", strength: x.role === "SUPPORT" || x.role === "JUNGLE" ? 0.8 : 0.3, text: "No control wards bought.", focus: "vision" });
  const solo = x.me.soloKills;
  if (typeof solo === "number" && solo >= SOLO_KILLS_MIN) out.push({ id: "S1", section: "well", topic: "highlight", strength: 0.2, text: `${solo} solo kills.` });
  const multi = x.me.largestMultiKill;
  if (typeof multi === "number" && multi >= MULTIKILL_MIN) out.push({ id: "M1", section: "well", topic: "highlight", strength: multi >= 4 ? 0.9 : 0.1, text: multi >= 5 ? "A penta kill." : multi === 4 ? "A quadra kill." : "A triple kill." });

  // The team's gold over the game (G1, G2).
  if (x.gold?.length) {
    const low = x.gold.reduce((a, b) => (b.diff < a.diff ? b : a));
    const high = x.gold.reduce((a, b) => (b.diff > a.diff ? b : a));
    if (x.win && low.diff <= -TEAM_GOLD_SWING) out.push({ id: "G1", section: "well", topic: "team", strength: 0.15, text: `${w.Their} team won from ${n(low.diff)} gold behind (at ${clock(low.minute)}).` });
    if (!x.win && high.diff >= TEAM_GOLD_SWING) out.push({ id: "G2", section: "wrong", topic: "team", strength: 0.15, text: `${w.Their} team lost after leading by ${n(high.diff)} gold (at ${clock(high.minute)}).` });
  }

  // The jungle's early objectives (J1).
  if (x.role === "JUNGLE" && x.objectives) {
    const early = x.objectives.filter((o) => o.minute < JUNGLE_MINUTE && (o.kind === "dragon" || o.kind === "grubs" || o.kind === "herald"));
    const total = early.reduce((s, o) => s + (o.count ?? 1), 0);
    const ours = early.filter((o) => o.own).reduce((s, o) => s + (o.count ?? 1), 0);
    if (total >= JUNGLE_OBJECTIVES_MIN) {
      const r = ours / total;
      const text = `Before 15 minutes ${w.possessive} team took ${ours} of the ${total} dragons, voidgrubs and heralds.`;
      if (r >= JUNGLE_HIGH) out.push({ id: "J1", section: "well", topic: "objectives", strength: clamp((r - JUNGLE_HIGH) / (1 - JUNGLE_HIGH)), text });
      else if (r <= JUNGLE_LOW) out.push({ id: "J1", section: "wrong", topic: "objectives", strength: clamp((JUNGLE_LOW - r) / JUNGLE_LOW), text });
    }
  }
  return out;
}

/** Team notes and highlights come after the player's own. */
const LATER: ReadonlySet<NoteTopic> = new Set(["team", "highlight"]);

function pick(notes: Note[]): Note[] {
  const sorted = [...notes].sort((a, b) => Number(LATER.has(a.topic)) - Number(LATER.has(b.topic)) || b.strength - a.strength);
  const chosen: Note[] = [];
  for (const note of sorted) {
    if (chosen.length >= PER_SECTION) break;
    if (chosen.some((c) => c.topic === note.topic)) continue;
    chosen.push(note);
  }
  return chosen;
}

function focusText(kind: FocusKind, x: NotesInput, cue: { note?: Note }): string | null {
  const fig = (key: FigureKey) => x.personal?.figures.find((f) => f.key === key) ?? null;
  const usual = (key: FigureKey) => {
    const f = fig(key);
    return f ? figureWords(f, f.median) : null;
  };
  const ten = x.lane?.find((l) => l.minute === 10);
  switch (kind) {
    case "lane":
      // From the bot lane's two against two (L5): the pair's figure, never the solo lane's.
      if (cue.note?.id === "L5" && x.pair) return `The first 10 minutes in the bot lane: ${x.pair.gold >= 0 ? "+" : "−"}${n(x.pair.gold)} gold for the pair at 10:00.`;
      // From a lead that fell between 10 and 15 minutes (L4): those five minutes and their gold, never
      // the first 10, which the same view may list under Went well.
      if (cue.note?.id === "L4" && x.opponent) {
        const fifteen = x.lane?.find((l) => l.minute === 15);
        if (ten?.you && ten.opponent && fifteen?.you && fifteen.opponent) {
          const signed = (g: number) => `${g >= 0 ? "+" : "−"}${n(g)}`;
          return `Between 10 and 15 minutes against ${x.opponent}: from ${signed(ten.you.gold - ten.opponent.gold)} to ${signed(fifteen.you.gold - fifteen.opponent.gold)} gold.`;
        }
      }
      if (x.opponent && ten?.you && ten.opponent) {
        const g = ten.you.gold - ten.opponent.gold;
        return `The first 10 minutes against ${x.opponent}: ${ten.you.cs} CS and ${g >= 0 ? "+" : "−"}${n(g)} gold at 10:00.`;
      }
      return x.pair ? `The first 10 minutes in the bot lane: ${x.pair.gold >= 0 ? "+" : "−"}${n(x.pair.gold)} gold for the pair at 10:00.` : null;
    case "early-deaths": {
      const early = x.deathTimes?.filter((t) => t < EARLY_MINUTE).length ?? 0;
      return `Staying alive before 10 minutes: ${early} deaths before 10:00 this game.`;
    }
    case "deaths": {
 const f = fig("kda");
      return f && cue.note?.id !== "D2" ? `Deaths: ${x.me.deaths} this game; KDA ${figureWords(f, f.value)} against a usual ${figureWords(f, f.median)}.` : `Deaths: ${x.me.deaths} this game, the most on your team.`;
    }
    case "vision": {
      const u = usual("visionPerMin");
      return u ? `Vision: your usual is ${u} per minute; a control ward on each recall is the simplest start.` : "Vision: a control ward on each recall is the simplest start.";
    }
    case "cs": {
      const f = fig("csPerMin");
      return f ? `CS: ${figureWords(f, f.value)} per minute this game; ${figureWords(f, f.median)} usually.` : null;
    }
    case "damage": {
      const f = fig("damagePerMin");
      return f ? `Damage: ${figureWords(f, f.value)} per minute this game; ${figureWords(f, f.median)} usually.` : null;
    }
    case "teamplay": {
      const f = fig("killParticipation");
      return f ? `Joining fights: ${figureWords(f, f.value)} kill participation this game; ${figureWords(f, f.median)} usually.` : null;
    }
  }
}

/** The notes of one game: at most 2 Went well and 2 Went wrong (distinct topics), then 1 Focus next on the viewer's own game. */
export function matchNotes(x: NotesInput): MatchNotes {
  const w = viewerWords(x.own, x.champion);
  if (x.remake) return { well: [], wrong: [], focus: null, fallback: "Remakes are not analysed." };
  const all = firingNotes(x);
  const well = pick(all.filter((note) => note.section === "well"));
  const wrong = pick(all.filter((note) => note.section === "wrong"));
  let focus: MatchNotes["focus"] = null;
  if (x.own) {
    const cue = [...wrong].sort((a, b) => b.strength - a.strength).find((note) => note.focus);
    const low = x.personal?.figures.filter((f) => FIGURE_FOCUS[f.key] && f.percentile <= FOCUS_PERCENTILE).sort((a, b) => a.percentile - b.percentile)[0];
    const kind = cue?.focus ?? (low ? FIGURE_FOCUS[low.key]! : null);
    const text = kind ? focusText(kind, x, { note: cue }) : null;
    if (kind && text) focus = { kind, text, cue: cue?.id ?? null };
  }
  const role = x.role ? ROLE_LABELS[x.role] : null;
  const queue = QUEUE_GROUP_WORDS[groupOf(x.queueId)];
  let fallback: string | null = null;
  if (!x.personal && role && groupOf(x.queueId) !== "other" && !well.length && !wrong.length) fallback = `After 10 ${queue ? `${queue} ` : ""}games as ${role}, a game is compared with ${w.possessive} usual ones.`;
  else if (!well.length && !wrong.length) fallback = role && x.personal ? `Nothing stood out against ${w.possessive} usual ${role} games.` : "Nothing stood out in this game.";
  return { well, wrong, focus, fallback };
}

function groupOf(queueId: number | null) {
  return queueId === 420 || queueId === 440 ? "ranked" : queueId === 400 || queueId === 430 ? "normal" : queueId === 480 || queueId === 490 ? "fast" : queueId === 700 ? "clash" : "other";
}

/** Words in a sentence (numbers and figures count as words). */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** The refused words a text contains (whole words, any case). */
export function refusedWordsIn(text: string): string[] {
  const lower = text.toLowerCase();
  return REFUSED_WORDS.filter((word) => new RegExp(`(^|[^a-z])${word.replace(" ", "\\s+")}([^a-z]|$)`).test(lower));
}
