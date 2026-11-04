import { createHmac } from "node:crypto";
import { sessionSecretValue } from "@/server/auth/mode";

/*
  Keyed one-way tokens for personal-data erasure (server/privacy/erasure.ts). An erasure record
  keeps tokens of the identifiers it removed, never the identifiers themselves: HMAC-SHA256 under
  a key derived from UNIIVERSE_AUTH_SECRET, which never enters the database. Without the
  deployment's secret a token cannot be tested against a guessed Riot ID; with it, the app can
  recognise the same identifier again (a game synced later, a Riot account linked again, a backup
  restored from before the erasure). Every comparison happens here, in the app: no key material
  is ever sent to the database.
*/

export type TokenKind = "user" | "player" | "account" | "puuid" | "riotid";

const CONTEXT = "uniiverse:privacy-erasure:v1";

let cached: { secret: string; key: Buffer } | null = null;

/** The erasure key for this deployment (derived, never stored). */
export function erasureKey(secret: string = sessionSecretValue()): Buffer {
  if (cached?.secret !== secret) cached = { secret, key: createHmac("sha256", secret).update(CONTEXT).digest() };
  return cached.key;
}

/** One identifier's token ("kind:token" is how a record stores it). */
export function tokenOf(kind: TokenKind, value: string, key: Buffer = erasureKey()): string {
  return createHmac("sha256", key).update(`${kind}:${value}`).digest("hex");
}

export const tagged = (kind: TokenKind, value: string, key?: Buffer): string => `${kind}:${tokenOf(kind, value, key)}`;

/** Tells whether a record was made with this deployment's key (a replaced UNIIVERSE_AUTH_SECRET makes its tokens unusable). */
export function keyCheckOf(key: Buffer = erasureKey()): string {
  return createHmac("sha256", key).update("key-check").digest("hex").slice(0, 16);
}

/**
 * A Riot ID in the one form tokens use: Unicode-normalised, lower case, without spaces (Riot
 * matches names without regard to case; spaces are dropped so "Hide on bush" and "Hideonbush"
 * count as one). Null for anything that is not "name#tag".
 */
export function normaliseRiotId(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.lastIndexOf("#");
  if (at <= 0 || at === value.length - 1) return null;
  const fold = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
  const name = fold(value.slice(0, at));
  const tag = fold(value.slice(at + 1));
  return name && tag ? `${name}#${tag}` : null;
}

/** The token of a Riot ID ("name#tag", any spelling); null when it is not one. */
export function riotIdToken(value: string | null | undefined, key?: Buffer): string | null {
  const id = normaliseRiotId(value);
  return id ? tagged("riotid", id, key) : null;
}
