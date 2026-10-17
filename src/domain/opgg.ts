/*
  Links from a completed match to a player's public OP.GG profile. Only what the stored match
  already says is used: the Riot ID Riot recorded for the player (Match-V5) and the server the
  match was played on (the prefix of its match id). Nothing is looked up, and a name that is not a
  well-formed Riot ID, or a match from a server OP.GG does not list, gets no link.
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

/**
 * A recorded "Name#TAG" split into its parts, or null when it is not a reliable Riot ID: exactly
 * one "#", a game name of 1–16 characters without control characters, and a tag of 3–5 letters or
 * digits (any script). Names stay exactly as Riot recorded them, apart from surrounding spaces.
 */
export function parseRiotId(raw: string | null | undefined): RiotIdParts | null {
  if (!raw) return null;
  const parts = raw.split("#");
  if (parts.length !== 2) return null;
  const gameName = parts[0]!.trim();
  const tagLine = parts[1]!.trim();
  const length = [...gameName.normalize("NFC")].length;
  if (length < 1 || length > 16 || /\p{Cc}|\p{Cf}/u.test(gameName)) return null;
  if (!/^[\p{L}\p{N}]{3,5}$/u.test(tagLine.normalize("NFC"))) return null;
  return { gameName, tagLine };
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
  return `https://op.gg/lol/summoners/${region}/${encodeURIComponent(id.gameName)}-${encodeURIComponent(id.tagLine)}`;
}
