import { RIOT_TEXT_KINDS, SLOTS, type RiotTextChampion, type RiotTextFact, type RiotTextSource, type Slot } from "@/domain/matchup-intel/types";
import { RIOT_TEXT_FILES } from "./riot-text/index";

/*
  MATCHUP INTEL's facts from Riot's ability text (L3; docs/MATCHUP_INTEL.md, "Facts from Riot's
  text"): for each champion, the kinds of mechanic Riot's own description or tooltip names, each with
  the clause it quotes, as the review accepted them (two independent automated reviews and an
  adjudicator; not a person). Committed one file per champion (riot-text/<Id>.json) and loaded on the
  server only for the champions on the page; the browser gets the plain view built from them.

  Read defensively: a file in another shape, or a fact that is not one, is left out, never shown.
*/

const CHAMPION = /^[A-Za-z0-9]{1,40}$/;
const VERSION = /^\d{1,4}(\.\d{1,4}){1,3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{16}$/;
const KINDS: ReadonlySet<string> = new Set(RIOT_TEXT_KINDS);
const SOURCES: ReadonlySet<string> = new Set<RiotTextSource>(["description", "tooltip"]);
/** The longest clause shown, in characters: a sentence of Riot's text, never a paragraph. */
export const MAX_CLAUSE = 400;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isSlot = (v: unknown): v is Slot => typeof v === "string" && (SLOTS as readonly string[]).includes(v);

/** Control, zero-width and bidirectional characters (those curated texts may not hold either), by code point. */
const CONTROL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x001f],
  [0x007f, 0x009f],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const isControl = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return CONTROL_RANGES.some(([a, b]) => c >= a && c <= b);
};

/** A clause as the page may show it: Riot's words, plain text, not empty, no markup or control characters. */
function clauseOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_CLAUSE || /[<>]|\{\{|\}\}/.test(text) || [...text].some(isControl)) return null;
  return text;
}

/** One champion's reviewed facts as committed, or null when the file is not in that shape (or not this champion's). */
export function parseRiotText(raw: unknown, championId: string): RiotTextChampion | null {
  if (!isObject(raw) || raw.championId !== championId || typeof raw.version !== "string" || !VERSION.test(raw.version) || typeof raw.reviewedOn !== "string" || !DAY.test(raw.reviewedOn)) return null;
  const review = raw.review;
  if (!isObject(review) || !Number.isInteger(review.automatedReviews) || (review.automatedReviews as number) < 0 || typeof review.adjudicated !== "boolean" || typeof review.person !== "boolean") return null;
  if (!isObject(raw.abilities) || !Array.isArray(raw.facts)) return null;
  const abilities: RiotTextChampion["abilities"] = {};
  for (const [slot, value] of Object.entries(raw.abilities)) {
    if (!isSlot(slot) || !isObject(value) || typeof value.name !== "string" || !value.name.trim() || typeof value.textHash !== "string" || !HASH.test(value.textHash)) return null;
    abilities[slot] = { name: value.name, textHash: value.textHash };
  }
  const facts: RiotTextFact[] = [];
  for (const f of raw.facts) {
    if (!isObject(f) || !isSlot(f.slot) || !abilities[f.slot] || typeof f.kind !== "string" || !KINDS.has(f.kind) || typeof f.source !== "string" || !SOURCES.has(f.source)) continue;
    const clause = clauseOf(f.clause);
    if (clause) facts.push({ slot: f.slot, kind: f.kind as RiotTextFact["kind"], clause, source: f.source as RiotTextSource });
  }
  return { championId, version: raw.version, reviewedOn: raw.reviewedOn, review: { automatedReviews: review.automatedReviews as number, adjudicated: review.adjudicated, person: review.person }, abilities, facts };
}

/** One champion's reviewed facts, or null when none are committed (or its file cannot be read). Each file loads once per instance. */
async function loadOne(championId: string): Promise<RiotTextChampion | null> {
  const load = CHAMPION.test(championId) && Object.hasOwn(RIOT_TEXT_FILES, championId) ? RIOT_TEXT_FILES[championId] : undefined;
  if (!load) return null;
  try {
    return parseRiotText((await load()).default, championId);
  } catch {
    return null;
  }
}

/** The reviewed facts of the champions given (each null when it has none): only their files are loaded. */
export async function loadRiotText(championIds: readonly string[]): Promise<Record<string, RiotTextChampion | null>> {
  const ids = [...new Set(championIds)];
  const loaded = await Promise.all(ids.map(loadOne));
  return Object.fromEntries(ids.map((id, i) => [id, loaded[i] ?? null]));
}

/** The champions with reviewed facts committed. */
export function riotTextChampions(): string[] {
  return Object.keys(RIOT_TEXT_FILES);
}
