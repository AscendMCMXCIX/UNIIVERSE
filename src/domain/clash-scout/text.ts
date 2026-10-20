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

/** A win rate shown as a percentage ("63%", "63 %"), 0–100, or null. */
export function parseWinRate(text: string): number | null {
  const m = /(\d{1,3}(?:[.,]\d)?)\s*%/.exec(text);
  if (!m) return null;
  const v = num(m[1]!);
  return v >= 0 && v <= 100 ? v : null;
}

/** Games played: "41 games", "41G", "41 Played", or wins and losses ("25W 16L" → 41). Null when not shown. */
export function parseGames(text: string): number | null {
  const wl = /(\d{1,4})\s*W\b[\s/·-]*(\d{1,4})\s*L\b/i.exec(text);
  if (wl) return Number(wl[1]) + Number(wl[2]);
  const g = /(\d{1,4})\s*(?:games?|played|G)\b/i.exec(text);
  return g ? Number(g[1]) : null;
}

/** KDA ratio: "3.42 KDA", "KDA 3.42", "3.42:1", or null. */
export function parseKda(text: string): number | null {
  const m = /(\d{1,2}[.,]\d{1,2})\s*(?::\s*1\b|KDA\b)/i.exec(text) ?? /\bKDA\s*(\d{1,2}[.,]\d{1,2})/i.exec(text);
  if (!m) return null;
  const v = num(m[1]!);
  return v >= 0 && v < 100 ? v : null;
}

const LEVEL = /\b(?:mastery|level|lvl?\.?|m)\s*(\d{1,2})\b/i;

/** The text without its mastery level ("Mastery 7 512,345 pts" → " 512,345 pts"), so the level's digit is never read as part of the points. */
function withoutLevel(text: string): string {
  return text.replace(LEVEL, " ");
}

/** Mastery points: "512,345", "512 345", "512.345 pts", "1.2M", "843K". Null when no figure looks like points. */
export function parseMasteryPoints(raw: string): number | null {
  const text = withoutLevel(raw);
  const short = /(\d{1,3}(?:[.,]\d{1,2})?)\s*([KM])\b(?!\s*DA)/i.exec(text);
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
  return v >= 1 && v <= 99 ? v : null;
}

/** Words that label the screen rather than name a player. */
const LABELS = /^(ranked|solo|duo|solo\/duo|flex|mastery|champion|champions|games?|wins?|losses|kda|lp|win ?rate|points|pts|level|top|most played|clash|scouting|team|tier|season|unranked|history|overview)$/i;

/** Whether a line can only be a label or a figure, never a player's name. */
export function isLabelOrFigure(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (LABELS.test(t)) return true;
  // A run of labels ("CLASH · RANKED", "Ranked Solo/Duo").
  if (t.split(/[\s·•|:\-–—]+/).filter(Boolean).every((w) => LABELS.test(w))) return true;
  if (parseRank(t) || parseWinRate(t) !== null || parseGames(t) !== null || parseKda(t) !== null) return true;
  if (/^[\d\s.,:%/·|()+-]+$/.test(t)) return true;
  return false;
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
