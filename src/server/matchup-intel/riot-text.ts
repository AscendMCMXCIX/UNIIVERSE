import { RIOT_TEXT_KINDS, SLOTS, type RiotTextChampion, type RiotTextDisagreement, type RiotTextFact, type RiotTextKind, type RiotTextReview, type RiotTextSource, type Slot } from "@/domain/matchup-intel/types";
import { RIOT_TEXT_FILES } from "./riot-text/index";

/*
  MATCHUP INTEL's facts from Riot's ability text (L3; docs/MATCHUP_INTEL.md, "Facts from Riot's
  text"): for each champion, the kinds of mechanic Riot's own description or tooltip names, each with
  the clause it quotes and what the review recorded beside it (a qualifier, the conditional marker,
  another kind Riot's other text words it as), and where Riot's two texts differ, as the review
  accepted them (two independent automated reviewers and an adjudicator, then a consistency pass
  checked by two more; not a person). Committed one file per champion (riot-text/<Id>.json) and
  loaded on the server only for the champions on the page; the browser gets the plain view built
  from them.

  Read defensively: a file in another shape, or a fact or disagreement that is not one, is left out,
  never shown. A fact with a field the page does not know is left out too, since what it says might
  narrow the fact (a qualifier the page would not show); so is a fact of a kind Riot's two texts
  differ on for its ability, which would pick one of them.
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

/** A span as the page may show it (a clause, a qualifier): Riot's words, plain text, not empty, no markup, placeholders or control characters. */
function clauseOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_CLAUSE || /[<>]|\{\{|\}\}/.test(text) || [...text].some(isControl)) return null;
  return text;
}

const isKind = (v: unknown): v is RiotTextKind => typeof v === "string" && KINDS.has(v);
const isSource = (v: unknown): v is RiotTextSource => typeof v === "string" && SOURCES.has(v);
const FACT_FIELDS: ReadonlySet<string> = new Set(["slot", "kind", "clause", "source", "qualifier", "qualifierSource", "conditional", "alsoDescribedAs"]);

/** The review record as committed, or null when it is not one the page can label truthfully (a person's check has no label yet). */
function reviewOf(v: unknown): RiotTextReview | null {
  if (!isObject(v)) return null;
  const { automatedReviewers, adjudicated, consistencyCheckers, checkedByPerson } = v;
  if (!Number.isInteger(automatedReviewers) || (automatedReviewers as number) < 1 || typeof adjudicated !== "boolean" || !Number.isInteger(consistencyCheckers) || (consistencyCheckers as number) < 0 || checkedByPerson !== false) return null;
  return { automatedReviewers: automatedReviewers as number, adjudicated, consistencyCheckers: consistencyCheckers as number, checkedByPerson };
}

/** One fact as committed, or null when it is not one in every field the page shows (the slot is checked by the caller). */
function factOf(f: Record<string, unknown>, slot: Slot): RiotTextFact | null {
  if (Object.keys(f).some((k) => !FACT_FIELDS.has(k)) || !isKind(f.kind) || !isSource(f.source)) return null;
  const clause = clauseOf(f.clause);
  if (!clause) return null;
  const fact: RiotTextFact = { slot, kind: f.kind, clause, source: f.source };
  if (f.qualifier !== undefined) {
    const qualifier = clauseOf(f.qualifier);
    if (!qualifier) return null;
    fact.qualifier = qualifier;
  }
  if (f.qualifierSource !== undefined) {
    // Only beside a qualifier, and only the ability's other text.
    if (fact.qualifier === undefined || !isSource(f.qualifierSource) || f.qualifierSource === f.source) return null;
    fact.qualifierSource = f.qualifierSource;
  }
  if (f.conditional !== undefined) {
    if (f.conditional !== true) return null;
    fact.conditional = true;
  }
  if (f.alsoDescribedAs !== undefined) {
    const a = f.alsoDescribedAs;
    const clause = isObject(a) ? clauseOf(a.clause) : null;
    if (!isObject(a) || !isKind(a.kind) || a.kind === f.kind || !isSource(a.source) || !clause) return null;
    fact.alsoDescribedAs = { kind: a.kind, source: a.source, clause };
  }
  return fact;
}

/** One disagreement as committed, or null when it is not one (two texts, two different known kinds, each with its clause). */
function disagreementOf(d: unknown, abilities: RiotTextChampion["abilities"]): RiotTextDisagreement | null {
  if (!isObject(d) || !isSlot(d.slot) || !abilities[d.slot] || !isObject(d.description) || !isObject(d.tooltip)) return null;
  const side = (s: Record<string, unknown>) => {
    const clause = clauseOf(s.clause);
    return isKind(s.kind) && clause ? { kind: s.kind, clause } : null;
  };
  const description = side(d.description);
  const tooltip = side(d.tooltip);
  if (!description || !tooltip || description.kind === tooltip.kind) return null;
  return { slot: d.slot, description, tooltip };
}

/** One champion's reviewed facts as committed, or null when the file is not in that shape (or not this champion's). */
export function parseRiotText(raw: unknown, championId: string): RiotTextChampion | null {
  if (!isObject(raw) || raw.championId !== championId || typeof raw.version !== "string" || !VERSION.test(raw.version) || typeof raw.reviewedOn !== "string" || !DAY.test(raw.reviewedOn)) return null;
  const review = reviewOf(raw.review);
  if (!review || !isObject(raw.abilities) || !Array.isArray(raw.facts) || !Array.isArray(raw.disagreements)) return null;
  const abilities: RiotTextChampion["abilities"] = {};
  for (const [slot, value] of Object.entries(raw.abilities)) {
    if (!isSlot(slot) || !isObject(value) || typeof value.name !== "string" || !value.name.trim() || typeof value.textHash !== "string" || !HASH.test(value.textHash)) return null;
    abilities[slot] = { name: value.name, textHash: value.textHash };
  }
  const disagreements: RiotTextDisagreement[] = [];
  for (const d of raw.disagreements) {
    const disagreement = disagreementOf(d, abilities);
    if (disagreement) disagreements.push(disagreement);
  }
  const disputed = (slot: Slot, kind: RiotTextKind) => disagreements.some((d) => d.slot === slot && (d.description.kind === kind || d.tooltip.kind === kind));
  const facts: RiotTextFact[] = [];
  for (const f of raw.facts) {
    if (!isObject(f) || !isSlot(f.slot) || !abilities[f.slot]) continue;
    const fact = factOf(f, f.slot);
    // One fact per ability and kind; none of a kind Riot's two texts differ on there.
    if (fact && !disputed(fact.slot, fact.kind) && !facts.some((x) => x.slot === fact.slot && x.kind === fact.kind)) facts.push(fact);
  }
  return { championId, version: raw.version, reviewedOn: raw.reviewedOn, review, abilities, facts, disagreements };
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
