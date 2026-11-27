import { canonicalPatch, comparePatches, isValidPatch, publicPatchName } from "@/domain/patch";
import { isRole, type Role } from "@/domain/roles";
import { estimateWord, refusedWords } from "./refused-words";

/*
  MATCHUP INTEL's reviewed notes (docs/MATCHUP_INTEL.md, "Reviewed notes"): short observations about
  two kits that a team administrator writes in Admin → Platform Settings → Matchup notes, each with
  its sources and the patch it was reviewed on, kept in matchup_notes. Pure: what a note may say
  (validateNote, checked on every save on the server and live in the editor) and whether it still
  shows (noteFreshness, computed at every read from Riot's data as stored), tested in notes.test.ts.

  - Two scopes: an opponent note (role + opponent) shows for every pair whose lane opponent it is;
    a pair note (role + champion + opponent) for that one pairing, in that direction.
  - 1 to 4 points, each at most 35 words, plain text, every one naming the abilities it rests on
    (refs "Darius.E") that exist in the stored kits of the scope's champions; an optional level tag.
  - Refused: the refused words (absolutes, instructions, verdicts), the estimate words, a Riot ID's
    tag (#EUW), and any current account's or player's name: no note names a player.
  - At least one source, each with a kind, a title, a patch and, where given, an https address. No
    script reads the League of Legends Wiki (Weird Gloop's terms): a wiki page is read in a browser.
  - Freshness (OD-M4): fresh on the patch it was reviewed on and the next; "not re-checked" two and
    three patches on (shown, labelled); hidden from the fourth, and at once when Riot's data for
    either champion changed since the review (a kit hash differs: server/matchup/kit-hash.ts).
  Considerations, never instructions; no Riot tips, no old AI briefings, no 2v2 (OD-M6/7/8).
*/

export type NoteScope = "opponent" | "pair";
export type NoteStatus = "draft" | "published" | "retired";
export type NoteLevels = "1-3" | "6" | null;

export const MAX_POINTS = 4;
export const MAX_POINT_WORDS = 35;
export const MAX_SOURCES = 6;
export const MAX_SOURCE_TITLE = 120;
export const MAX_POINT_REFS = 4;

/** The kinds of source a note may cite. */
export const SOURCE_KINDS = {
  client: "In-game client tooltip",
  "patch-notes": "Riot patch notes",
  ddragon: "Riot's Data Dragon",
  wiki: "League of Legends Wiki (read in a browser)",
  games: "The team's games",
  other: "Other",
} as const;
export type SourceKind = keyof typeof SOURCE_KINDS;

export const LEVEL_LABELS: Record<Exclude<NoteLevels, null>, string> = { "1-3": "Levels 1–3", "6": "Level 6" };

export interface NotePoint {
  text: string;
  /** The abilities it rests on: "Darius.E" (a champion's id and a slot, P to R). */
  refs: string[];
  levels: NoteLevels;
}

export interface NoteSource {
  kind: SourceKind;
  title: string;
  /** An https address, or "" for none. */
  url: string;
  /** The patch it was read on, public ("26.23"). */
  patch: string;
}

/** What an editor sends to save (draft or publish). */
export interface NoteInput {
  scope: NoteScope;
  role: Role;
  opponentId: string;
  /** The champion played; null for an opponent note. */
  championId: string | null;
  points: NotePoint[];
  sources: NoteSource[];
}

/** One stored note as the band and Admin read it. */
export interface MatchupNote extends NoteInput {
  id: string;
  status: NoteStatus;
  /** The patch reviewed on, internal ("16.23"), and its Data Dragon version; null on a draft. */
  reviewedPatch: string | null;
  reviewedVersion: string | null;
  reviewedAt: string | null;
  /** Each scope champion's kit hash at the review. */
  kitHashes: Record<string, string> | null;
  /** Each scope champion's abilities' hashes at the review (what changed, in words). */
  abilityHashes: Record<string, Record<string, string>> | null;
  updatedAt: string;
}

/** The scope's champions: the opponent, and the champion played for a pair note. */
export function scopeChampions(note: Pick<NoteInput, "scope" | "opponentId" | "championId">): string[] {
  return note.scope === "pair" && note.championId ? [note.championId, note.opponentId] : [note.opponentId];
}

const REF = /^([A-Za-z][A-Za-z0-9]{0,40})\.([PQWER])$/;
const CHAMPION_ID = /^[A-Za-z][A-Za-z0-9]{0,40}$/;
/** A Riot ID's tag ("#EUW", "#1234"). */
const RIOT_TAG = /#[A-Za-z0-9]{2,5}\b/;
const wordsIn = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** One problem with a note, said so the editor can show it beside its field. */
export interface NoteProblem {
  /** "points.0", "points.0.refs", "sources.1.url", "sources", "scope". */
  field: string;
  message: string;
}

export interface NoteContext {
  /** Each scope champion's stored ability slots (P to R), by its id; a champion missing here has none stored. */
  kits: Record<string, readonly string[]>;
  /** Champion ids on the roster. */
  roster: ReadonlySet<string>;
  /** Names no note may hold (accounts' usernames and display names, players' names, linked Riot names), any case. */
  names: readonly string[];
}

/** A text's problems as a note's words: refused words, estimate words, a Riot ID's tag, a person's name. */
export function textProblems(text: string, names: readonly string[]): string[] {
  const out: string[] = [];
  for (const r of refusedWords(text)) out.push(`"${r.word}" is ${r.why}: notes are observations, never advice or a verdict.`);
  const estimate = estimateWord(text);
  if (estimate) out.push(`"${estimate}" gives a value as an estimate: leave out a value a source marks as estimated.`);
  if (RIOT_TAG.test(text)) out.push("A Riot ID's tag (#…) names a player: notes never name players.");
  const lower = text.toLowerCase();
  for (const name of names) {
    const n = name.trim().toLowerCase();
    if (n.length >= 3 && new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "u").test(lower)) {
      out.push("It names a member or player: notes never name players.");
      break;
    }
  }
  return out;
}

/** Every problem with a note before it is saved (an empty list: it may be saved). Drafts and publishing are held to the same rules. */
export function validateNote(input: NoteInput, ctx: NoteContext): NoteProblem[] {
  const problems: NoteProblem[] = [];
  const add = (field: string, message: string) => problems.push({ field, message });
  if (input.scope !== "opponent" && input.scope !== "pair") add("scope", "Choose an opponent note or a pair note.");
  if (!isRole(input.role)) add("role", "Choose a role.");
  if (!CHAMPION_ID.test(input.opponentId) || !ctx.roster.has(input.opponentId)) add("opponentId", "Choose the lane opponent.");
  if (input.scope === "pair") {
    if (!input.championId || !CHAMPION_ID.test(input.championId) || !ctx.roster.has(input.championId)) add("championId", "Choose the champion played.");
    else if (input.championId === input.opponentId) add("championId", "A champion is picked only once in a draft game: choose two champions.");
  } else if (input.championId) add("championId", "An opponent note names only the opponent.");
  const scope = scopeChampions(input);
  for (const id of scope) if (ctx.roster.has(id) && !ctx.kits[id]?.length) add("opponentId", "Riot's abilities for this champion are not stored yet.");
  const points = Array.isArray(input.points) ? input.points : [];
  if (points.length < 1 || points.length > MAX_POINTS) add("points", `Write 1 to ${MAX_POINTS} points.`);
  points.slice(0, MAX_POINTS).forEach((p, i) => {
    const text = typeof p?.text === "string" ? p.text.trim() : "";
    if (!text) add(`points.${i}`, "Write the point, or remove it.");
    else {
      if (wordsIn(text) > MAX_POINT_WORDS) add(`points.${i}`, `At most ${MAX_POINT_WORDS} words a point (this one has ${wordsIn(text)}).`);
      if (/[<>]/.test(text) || /https?:\/\//i.test(text)) add(`points.${i}`, "Plain text only: no markup or links (sources carry the links).");
      if (/^[a-z]/.test(text)) add(`points.${i}`, "Start with a capital letter (sentence case).");
      for (const message of textProblems(text, ctx.names)) add(`points.${i}`, message);
    }
    const refs = Array.isArray(p?.refs) ? p.refs : [];
    if (!refs.length) add(`points.${i}.refs`, "Name the abilities the point rests on.");
    if (refs.length > MAX_POINT_REFS) add(`points.${i}.refs`, `At most ${MAX_POINT_REFS} abilities a point.`);
    for (const ref of refs) {
      const m = typeof ref === "string" ? REF.exec(ref) : null;
      if (!m || !scope.includes(m[1]!) || !ctx.kits[m[1]!]?.includes(m[2]!)) add(`points.${i}.refs`, `${typeof ref === "string" ? ref : "An ability"} is not one of these champions' stored abilities.`);
    }
    if (p?.levels !== null && p?.levels !== "1-3" && p?.levels !== "6") add(`points.${i}.levels`, "Choose levels 1–3, level 6 or none.");
  });
  const sources = Array.isArray(input.sources) ? input.sources : [];
  if (sources.length < 1) add("sources", "Cite at least one source.");
  if (sources.length > MAX_SOURCES) add("sources", `At most ${MAX_SOURCES} sources.`);
  sources.slice(0, MAX_SOURCES).forEach((s, i) => {
    if (!s || !Object.hasOwn(SOURCE_KINDS, s.kind)) add(`sources.${i}.kind`, "Choose what kind of source it is.");
    const title = typeof s?.title === "string" ? s.title.trim() : "";
    if (!title || title.length > MAX_SOURCE_TITLE) add(`sources.${i}.title`, `Give the source a title (at most ${MAX_SOURCE_TITLE} characters).`);
    else for (const message of textProblems(title, ctx.names).filter((m) => !m.includes("observations"))) add(`sources.${i}.title`, message);
    const url = typeof s?.url === "string" ? s.url.trim() : "";
    if (url) {
      let ok = false;
      try {
        const u = new URL(url);
        ok = u.protocol === "https:" && !u.username && !u.password && url.length <= 300;
      } catch {
        ok = false;
      }
      if (!ok) add(`sources.${i}.url`, "An address starts with https:// (or leave it empty).");
    }
    if (!isValidPatch(typeof s?.patch === "string" ? s.patch.trim() : "")) add(`sources.${i}.patch`, "The patch it was read on, such as 26.23.");
  });
  return problems;
}

/** A note's points and sources as stored: trimmed, the lists cut to their limits. */
export function cleanNoteInput(input: NoteInput): NoteInput {
  return {
    scope: input.scope,
    role: input.role,
    opponentId: input.opponentId.trim(),
    championId: input.scope === "pair" ? (input.championId?.trim() ?? null) : null,
    points: (input.points ?? []).slice(0, MAX_POINTS).map((p) => ({ text: p.text.trim().replace(/\s+/g, " "), refs: [...new Set(p.refs)].slice(0, MAX_POINT_REFS), levels: p.levels ?? null })),
    sources: (input.sources ?? []).slice(0, MAX_SOURCES).map((s) => ({ kind: s.kind, title: s.title.trim(), url: s.url.trim(), patch: s.patch.trim() })),
  };
}

export type NoteFreshness =
  | { state: "fresh"; distance: number }
  | { state: "stale"; distance: number }
  /** Riot's data for these champions changed since the review. */
  | { state: "hidden-changed"; changed: string[] }
  /** Four patches or more since the review, or a review patch the stored list does not know. */
  | { state: "hidden-old"; distance: number | null };

/** Fresh on the review patch and the next one; not re-checked two and three on; hidden from the fourth. */
export const FRESH_PATCHES = 1;
export const SHOWN_PATCHES = 3;

/**
 * Whether a published note shows, from Riot's data as stored now: `kitHashes` each scope
 * champion's current hash (a champion missing here counts as changed), `knownDesc` the stored
 * patches newest first (the patches table), `current` the current patch (internal). The distance
 * is counted in the stored list, so a year's boundary (26.24 → 27.1) is one patch.
 */
export function noteFreshness(note: Pick<MatchupNote, "reviewedPatch" | "kitHashes" | "scope" | "opponentId" | "championId">, now: { current: string | null; knownDesc: readonly string[]; kitHashes: Readonly<Record<string, string | null | undefined>> }): NoteFreshness {
  const changed = scopeChampions(note).filter((id) => !note.kitHashes?.[id] || now.kitHashes[id] !== note.kitHashes[id]);
  if (changed.length) return { state: "hidden-changed", changed };
  const known = now.knownDesc.map(canonicalPatch);
  const reviewed = note.reviewedPatch ? canonicalPatch(note.reviewedPatch) : null;
  const current = now.current ? canonicalPatch(now.current) : known[0] ?? null;
  const ci = current ? known.indexOf(current) : -1;
  const ri = reviewed ? known.indexOf(reviewed) : -1;
  if (ci < 0 || ri < 0) return { state: "hidden-old", distance: null };
  const distance = Math.max(0, ri - ci);
  if (distance <= FRESH_PATCHES) return { state: "fresh", distance };
  if (distance <= SHOWN_PATCHES) return { state: "stale", distance };
  return { state: "hidden-old", distance };
}

/** A note as the band shows it: the note and its freshness now. */
export interface ShownNote {
  note: MatchupNote;
  freshness: NoteFreshness;
}

/** The band's notes for one pair, or "unavailable" (a failure: none shown, logged). */
export type PairNotes = { notes: ShownNote[]; currentPatch: string | null } | { status: "unavailable" };

/** Whether a freshness shows the note's points on a member page. */
export const noteShown = (f: NoteFreshness) => f.state === "fresh" || f.state === "stale";

/** A note's ability refs as the band draws them: the champion's id and the slot. */
export function parseRef(ref: string): { champion: string; slot: "P" | "Q" | "W" | "E" | "R" } | null {
  const m = REF.exec(ref);
  return m ? { champion: m[1]!, slot: m[2] as "P" | "Q" | "W" | "E" | "R" } : null;
}

/** The patches between a review and now, public names, oldest first (the re-review dialog links Riot's notes for each). */
export function patchesSince(reviewed: string, knownDesc: readonly string[]): string[] {
  return knownDesc.filter((p) => comparePatches(p, reviewed) > 0).sort(comparePatches).map(publicPatchName);
}

/** The scope as a sentence's object, for Audit Logs (sentences, never "key: value"): "Riven against Darius in Top", "any champion against Darius in Top". */
export function scopeSentence(note: Pick<NoteInput, "scope" | "role">, names: { champion: string | null; opponent: string }, roleLabel: string): string {
  return note.scope === "pair" && names.champion ? `${names.champion} against ${names.opponent} in ${roleLabel}` : `any champion against ${names.opponent} in ${roleLabel}`;
}

/** The scope's words as a label (Admin's rows and editor), champion names given: "Top: Riven vs Darius", "Top: against Darius". */
export function scopeName(note: Pick<NoteInput, "scope" | "role">, names: { champion: string | null; opponent: string }, roleLabel: string): string {
  return note.scope === "pair" && names.champion ? `${roleLabel}: ${names.champion} vs ${names.opponent}` : `${roleLabel}: against ${names.opponent}`;
}
