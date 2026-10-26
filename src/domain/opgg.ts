/*
  The one place OP.GG profile links are built (match history and details, Team → Matches,
  Encounters, Riot Accounts). OP.GG's address is
  op.gg/lol/summoners/<region>/<game name>-<tag>, the name and tag percent-encoded as UTF-8 (so
  spaces, accents, Hangul, kana, Cyrillic and symbols all work) in Unicode NFC.

  A link needs a full Riot ID (game name and tag) and a server OP.GG lists; nothing is guessed. A
  PUUID is never part of the address: it only finds which Riot ID to use (see
  server/players/riot-names). A link to a valid address can still show "not found" on OP.GG when
  OP.GG has not indexed the account yet; that is OP.GG's side, not a malformed link.
*/

/** Riot platform id → OP.GG region slug. */
const OPGG_REGION: Readonly<Record<string, string>> = {
  na1: "na",
  euw1: "euw",
  eun1: "eune",
  kr: "kr",
  jp1: "jp",
  br1: "br",
  la1: "lan",
  la2: "las",
  oc1: "oce",
  tr1: "tr",
  ru: "ru",
  me1: "me",
  sg2: "sg",
  ph2: "ph",
  th2: "th",
  tw2: "tw",
  vn2: "vn",
};

export interface RiotIdParts {
  gameName: string;
  tagLine: string;
}

/** Why a recorded name makes no link (the data audit counts them); null when it makes one. */
export type RiotIdProblem = "no-name" | "no-tag" | "tag-length" | "tag-characters" | "name-length" | "name-characters";

const segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/**
 * Characters as a reader counts them: a letter with its accents or vowel signs is one (Thai tone
 * marks, a decomposed "é"), as Riot counts them for the 16-character limit. Without
 * Intl.Segmenter, the code points that are not combining marks.
 */
export function charactersIn(s: string): number {
  return segmenter ? [...segmenter.segment(s)].length : [...s.replace(/\p{M}/gu, "")].length;
}

/**
 * What is wrong with a recorded "Name#TAG", or null when it is a reliable Riot ID: exactly one "#",
 * a game name of 1–16 characters with no control or invisible formatting characters (the zero-width
 * joiner and non-joiner that Arabic, Persian and Indic names need are allowed), and a tag of 2–5
 * letters or digits in any script, each with its marks (see tagProblem).
 */
export function riotIdProblem(raw: string | null | undefined): RiotIdProblem | null {
  if (!raw?.trim()) return "no-name";
  const parts = raw.split("#");
  if (parts.length < 2 || !parts[parts.length - 1]!.trim()) return "no-tag";
  if (parts.length > 2) return "name-characters";
  const gameName = parts[0]!.trim().normalize("NFC");
  const tagLine = parts[1]!.trim().normalize("NFC");
  if (!gameName) return "no-name";
  if (charactersIn(gameName) > 16) return "name-length";
  if (/\p{Cc}/u.test(gameName) || /[^\P{Cf}‌‍]/u.test(gameName)) return "name-characters";
  return tagProblem(tagLine);
}

/**
 * What is wrong with a tag (trimmed, NFC), or null when it is 2–5 letters or digits in any script,
 * each with its marks. Riot's support pages give 3–5 for a tag people choose, but Riot's own
 * account records hold 2-character tags too: in the data audit of 26 Oct 2026, 8 of 18 linked
 * accounts had one as Riot's account record gives it, and 1,779 players recorded the same
 * 2-letter tag in every game, none cut from a longer one.
 */
export function tagProblem(tagLine: string): "tag-characters" | "tag-length" | null {
  if (!/^(?:[\p{L}\p{N}]\p{M}*)+$/u.test(tagLine)) return "tag-characters";
  const tagLength = charactersIn(tagLine);
  if (tagLength < 2 || tagLength > 5) return "tag-length";
  return null;
}

/**
 * A recorded "Name#TAG" split into its parts, or null when it is not a reliable Riot ID (see
 * riotIdProblem). Names stay exactly as Riot recorded them, apart from surrounding spaces.
 */
export function parseRiotId(raw: string | null | undefined): RiotIdParts | null {
  if (riotIdProblem(raw)) return null;
  const [gameName, tagLine] = raw!.split("#");
  return { gameName: gameName!.trim(), tagLine: tagLine!.trim() };
}

/**
 * The server a Riot match id was played on ("OC1_5012345678" → "oc1"). Strict: Riot's own format
 * (upper-case server, "_", numeric game id) on a server OP.GG lists; null for anything else, so
 * synthetic ids (demo "DEMO_…", hand-made test ids) never produce a real OP.GG link.
 */
export function platformOfMatchId(matchId: string): string | null {
  const m = /^([A-Z]+[0-9]*)_[0-9]+$/.exec(matchId);
  const platform = m?.[1]!.toLowerCase();
  return platform && platform in OPGG_REGION ? platform : null;
}

/** The player's OP.GG profile on that server, or null when the Riot ID or the server is not reliable. */
export function opggProfileUrl(riotId: string | null | undefined, platform: string | null): string | null {
  const id = parseRiotId(riotId);
  const region = platform ? OPGG_REGION[platform.toLowerCase()] : undefined;
  if (!id || !region) return null;
  return `https://op.gg/lol/summoners/${region}/${encodeURIComponent(id.gameName.normalize("NFC"))}-${encodeURIComponent(id.tagLine.normalize("NFC"))}`;
}

/** A Riot ID known for a player, with the server it was seen on. */
export interface KnownRiotId {
  riotId: string;
  /** Null: not confirmed (a linked account whose server Riot has not confirmed yet), so the match's own server is used. */
  platform: string | null;
}

/**
 * The link for one player: their best known Riot ID (a linked account's current one, or the one
 * from their newest stored game) when it makes a link, else the Riot ID and server this match
 * recorded. A player who renamed since the game is therefore linked by their current name.
 */
export function opggLinkFor(recorded: string | null | undefined, platform: string | null, known?: KnownRiotId | null): string | null {
  return (known ? opggProfileUrl(known.riotId, known.platform ?? platform) : null) ?? opggProfileUrl(recorded, platform);
}
