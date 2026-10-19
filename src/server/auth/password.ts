import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { validatePasswordStrength as validatePasswordLength } from "@/domain/password-policy";
import commonPasswords from "./common-passwords.json";

function scrypt(password: string, salt: Buffer, keylen: number, options: { N: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));
}
const KEY_LENGTH = 64;
const COST = 16384;

/** scrypt password hash in a self-describing format: scrypt$N$salt$hash (all base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: COST });
  return `scrypt$${COST}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, costRaw, saltRaw, hashRaw] = stored.split("$");
  if (scheme !== "scrypt" || !costRaw || !saltRaw || !hashRaw) return false;
  const expected = Buffer.from(hashRaw, "base64url");
  const derived = await scrypt(password.normalize("NFKC"), Buffer.from(saltRaw, "base64url"), expected.length, { N: Number(costRaw) });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordChecks } from "@/domain/password-policy";

let common: Set<string> | null = null;
/** True for a password on the bundled list of common passwords (common-passwords.json), ignoring case. */
export function isCommonPassword(password: string): boolean {
  common ??= new Set(commonPasswords.passwords);
  return common.has(password.normalize("NFKC").toLowerCase());
}

/**
 * Rules for a new or replaced password, on the server: the length rules the form shows
 * (domain/password-policy.ts), then not a common password. Existing passwords keep working
 * whatever rules they were chosen under.
 */
export function validatePasswordStrength(password: string): string | null {
  return validatePasswordLength(password) ?? (isCommonPassword(password) ? "That password is too common: it appears in lists attackers try first. Choose another." : null);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * A random temporary password for an admin to hand over: 14 characters from a 54-symbol
 * alphabet without look-alikes (≈80 bits), shown as three groups so it is easy to read out
 * (16 characters with the dashes, so it meets the length rule).
 */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let raw = "";
  for (let i = 0; i < 14; i++) raw += alphabet[randomInt(alphabet.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10)}`;
}
