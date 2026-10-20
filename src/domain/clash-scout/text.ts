import type { RankInfo } from "./types";

/*
  Reading the text of a Clash scouting screenshot: the figures it shows (rank, win rate, games,
  KDA, mastery level and points) and the players' names. Figures are read only from text that
  clearly is one (a "%" for a win rate, "LP" for league points…); anything ambiguous stays null
  rather than guessed. Names are kept exactly as recognised (any script), only tidied of OCR
  artefacts: surrounding punctuation, and the spaces OCR puts between CJK characters.
*/

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"] as const;
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const DIVISIONS: Record<string, string> = { IV: "IV", III: "III", II: "II", I: "I", "4": "IV", "3": "III", "2": "II", "1": "I" };

/** The rank a line shows ("Gold II", "EMERALD 4 · 52 LP", "Master 213 LP", "Unranked"), or null. */
export function parseRank(text: string): RankInfo | null {
  const t = text.toUpperCase();
  if (/\bUNRANKED\b/.test(t)) return { tier: "UNRANKED", division: null, lp: null };
  // Longest names first, so "GRANDMASTER" is not read as "MASTER".
  const tier = [...TIERS].sort((a, b) => b.length - a.length).find((x) => new RegExp(`\\b${x}\\b`).test(t));
  if (!tier) return null;
  const after = text.slice(t.indexOf(tier) + tier.length);
  // OCR often reads the roman numerals' "I" as "l", "|" or "1" ("Gold Il", "Diamond Ill", "Platinum |").
  const roman = /^\s*([IVlLi1|]{1,3}|[1-4])(?=[\s·•.,\-]|$)/.exec(after)?.[1] ?? null;
  const div = APEX.has(tier) || !roman ? null : normaliseDivision(roman);
  const lp = /(\d{1,4})\s*LP\b/.exec(t);
  return { tier, division: div ? DIVISIONS[div]! : null, lp: lp ? Number(lp[1]) : null };
}

function normaliseDivision(raw: string): string | null {
  if (/^[1-4]$/.test(raw)) return DIVISIONS[raw]!;
  const r = raw.replace(/[lLi1|]/g, "I").toUpperCase();
  return r in DIVISIONS ? DIVISIONS[r]! : null;
}

const num = (s: string) => Number(s.replace(",", "."));

// A figure starts a word: digits right after a letter are part of a misread ("S0%" is "50%" with
// its 5 read as S), never a figure of their own.
const START = "(?<![\\p{L}\\d.,])";
const WIN_RATE = new RegExp(`${START}(\\d{1,3}(?:[.,]\\d)?)\\s*%`, "u");
const SHORT_POINTS = new RegExp(`${START}(\\d{1,3}(?:[.,]\\d{1,2})?)\\s*([KM])\\b(?!\\s*DA)`, "iu");

/** A win rate shown as a percentage ("63%", "63 %"), 0–100, or null. */
export function parseWinRate(text: string): number | null {
  const m = WIN_RATE.exec(text);
  if (!m) return null;
  const v = num(m[1]!);
  return v >= 0 && v <= 100 ? v : null;
}

/**
 * Games played: "41 games", "41G", "41 Played", wins and losses ("25W 16L" → 41), or the count the
 * client prints in brackets after the win rate ("50% (2)"). Null when not shown.
 */
export function parseGames(text: string): number | null {
  const wl = /(\d{1,4})\s*W\b[\s/·-]*(\d{1,4})\s*L\b/i.exec(text);
  if (wl) return Number(wl[1]) + Number(wl[2]);
  const g = /(\d{1,4})\s*(?:games?|played|G)\b/i.exec(text);
  if (g) return Number(g[1]);
  const bracket = /%\s*[([{]\s*(\d{1,4})\s*[)\]}]/.exec(text);
  return bracket ? Number(bracket[1]) : null;
}

/** KDA ratio: "3.42 KDA", "KDA 3.42", "3.42:1", or null. */
export function parseKda(text: string): number | null {
  const m = /(\d{1,2}[.,]\d{1,2})\s*(?::\s*1\b|KDA\b)/i.exec(text) ?? /\bKDA\s*(\d{1,2}[.,]\d{1,2})/i.exec(text);
  if (!m) return null;
  const v = num(m[1]!);
  return v >= 0 && v < 100 ? v : null;
}

// "Lv 19", "Lvl. 7", "Level 12", "Mastery 7", "M7"; OCR also gives "oLv 11" or "v9" when it misreads the crest before "Lv".
// Levels have no ceiling since 2024: a one-trick's can pass 100.
const LEVEL = /(?:\b(?:mastery|level|m)|l?v\s*l?)\s*\.?\s*(\d{1,3})\b/i;

/** The text without its mastery level ("Mastery 7 512,345 pts" → " 512,345 pts"), so the level's digit is never read as part of the points. */
function withoutLevel(text: string): string {
  return text.replace(LEVEL, " ");
}

/** Mastery points: "512,345", "512 345", "512.345 pts", "1.2M", "843K". Null when no figure looks like points. */
export function parseMasteryPoints(raw: string): number | null {
  const text = withoutLevel(raw);
  const short = SHORT_POINTS.exec(text);
  // "122 9 k": OCR lost the decimal point of "122.9 k" but kept every digit (only ever just before K or M).
  const spaced = /\b(\d{1,3})\s(\d)\s*([KM])\b(?!\s*DA)/i.exec(text);
  if (spaced && (!short || spaced.index <= short.index)) return Math.round(Number(`${spaced[1]}.${spaced[2]}`) * (spaced[3]!.toUpperCase() === "M" ? 1_000_000 : 1_000));
  if (short) {
    const v = num(short[1]!) * (short[2]!.toUpperCase() === "M" ? 1_000_000 : 1_000);
    return Math.round(v);
  }
  const grouped = /\b(\d{1,3}(?:[,.   ]\d{3})+)\b/.exec(text);
  if (grouped) return Number(grouped[1]!.replace(/[,.   ]/g, ""));
  const pts = /\b(\d{4,8})\s*(?:pts|points)\b/i.exec(text);
  return pts ? Number(pts[1]) : null;
}

/** Mastery level: "Mastery 7", "Level 12", "Lv. 10", "M7". Null when not shown. */
export function parseMasteryLevel(text: string): number | null {
  const m = LEVEL.exec(text);
  if (!m) return null;
  const v = Number(m[1]);
  return v >= 1 && v <= 999 ? v : null;
}

/**
 * Words the client prints around the players (its tabs, headings, menus and statuses), never a
 * player's name on their own.
 */
const LABELS =
  /^(ranked|solo|duo|solo\/duo|flex|mastery|total|champion|champions|games?|wins?|losses|kda|lp|win ?rate|points|pts|level|lv|lvl|top|most played|clash|scouting|team|tier|season|unranked|history|overview|schedule|social|general|offline|online|in|game|for|pending|party|league|classic|tft|lobby|ready|locked|bracket|i|ii|iii|iv|v)$/i;

/** A countdown or clock ("4m 37s", "4M 16S", "12:34", "1h 02m"). */
export function isTimer(text: string): boolean {
  const t = text.trim();
  return /^\d{1,2}\s*[hm]\s*\d{1,2}\s*[ms]$/i.test(t) || /^\d{1,2}\s*[hms]$/i.test(t) || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(t);
}

/** Whether a line can only be a label, a timer or a figure, never a player's name. */
export function isLabelOrFigure(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (LABELS.test(t)) return true;
  // A run of labels ("CLASH · RANKED", "Ranked Solo/Duo", "TOTAL MASTERY", "Scouting for Clash", "TIER III").
  // OCR reads roman numerals as digits or other strokes ("TIER 111", "Tier Il").
  if (t.split(/[\s·•|:\-–—]+/).filter(Boolean).every((w) => LABELS.test(w) || /^[IVXivxl1|]{1,4}$/.test(w))) return true;
  if (/^tier\b/i.test(t) && t.length <= 12) return true;
  if (isTimer(t)) return true;
  if (parseRank(t) || parseWinRate(t) !== null || parseGames(t) !== null || parseKda(t) !== null) return true;
  if (/\d/.test(t) && /\b(?:pts|points)\b|\d\s*[km]\s*pts/i.test(t)) return true;
  if (/^[\d\s.,:%/·|()+-]+$/.test(t)) return true;
  // Counts the client prints with headings ("GENERAL (7/31)", "OFFLINE (24)").
  if (/^\p{L}+\s*\(\d+(?:\/\d+)?\)$/u.test(t) && LABELS.test(t.replace(/\s*\(.*$/, ""))) return true;
  return false;
}

/**
 * How much a tidied reading looks like a player's name (0–1), from its shape alone: Riot game
 * names are 3 to 16 characters of letters, digits and spaces (any script). OCR noise looks
 * different: runs of symbols, lone letters, very long strings. Never decides on its own; it
 * weighs readings against each other and marks doubtful ones for checking.
 */
export function nameShape(name: string): number {
  const s = name.trim();
  if (!s || isLabelOrFigure(s)) return 0;
  const chars = [...s];
  const letters = chars.filter((c) => /\p{L}/u.test(c)).length;
  const digits = chars.filter((c) => /\p{N}/u.test(c)).length;
  const spaces = chars.filter((c) => c === " ").length;
  // Underscores, dots, hyphens and apostrophes appear in real names; other symbols are usually noise.
  const other = chars.filter((c) => !/[\p{L}\p{N}\s_.'\-]/u.test(c)).length;
  if (!letters) return 0;
  let score = 1;
  if (chars.length > 16) score *= chars.length > 24 ? 0.2 : 0.55;
  // Single characters are rare names (a CJK name can be two).
  if (letters + digits < 2) score *= 0.3;
  else if (letters + digits < 3 && !hasNonLatin(s)) score *= 0.6;
  if (other) score *= other === 1 ? 0.75 : 0.35;
  if (spaces > 2) score *= 0.6;
  // Mixed scripts within one name (Latin with Hangul, say) are usually OCR mixing up shapes.
  const scripts = new Set(chars.filter((c) => /\p{L}/u.test(c)).map(scriptOf));
  if (scripts.size > 1) score *= 0.6;
  return score;
}

function scriptOf(c: string): string {
  if (/\p{Script=Latin}/u.test(c)) return "latin";
  if (/\p{Script=Cyrillic}/u.test(c)) return "cyrillic";
  if (/\p{Script=Hangul}/u.test(c)) return "hangul";
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(c)) return "cjk";
  if (/\p{Script=Greek}/u.test(c)) return "greek";
  if (/\p{Script=Thai}/u.test(c)) return "thai";
  if (/\p{Script=Arabic}/u.test(c)) return "arabic";
  return "other";
}

const CJK = "\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}";

/**
 * A recognised name tidied of OCR artefacts and nothing else: Unicode NFC, trimmed, surrounding
 * quotes and stray punctuation removed, and the spaces OCR inserts between CJK characters joined
 * (Riot names cannot contain those spaces' visual meaning there). Letters are never changed.
 */
export function cleanName(raw: string): string {
  let s = raw.normalize("NFC").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/^[\s"'“”‘’`|«»•·.,:;]+|[\s"'“”‘’`|«»•·.,:;]+$/gu, "");
  s = s.replace(new RegExp(`([${CJK}])\\s+(?=[${CJK}])`, "gu"), "$1");
  return s;
}

/** True when the name contains letters outside Basic Latin (where an eng-only reading is unreliable). */
export function hasNonLatin(name: string): boolean {
  return /[^\u0000-ɏ\s\d\p{P}]/u.test(name);
}

/** A comparison key for names: NFKC, case-folded, without spaces. Only for matching the two screenshots' columns, never for identifying accounts. */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, "");
}

/** Similarity of two names, 0–1 (edit distance on their comparison keys). */
export function nameSimilarity(a: string, b: string): number {
  const x = [...nameKey(a)];
  const y = [...nameKey(b)];
  if (!x.length && !y.length) return 1;
  if (!x.length || !y.length) return 0;
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (x[i - 1] === y[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return 1 - prev[y.length]! / Math.max(x.length, y.length);
}
