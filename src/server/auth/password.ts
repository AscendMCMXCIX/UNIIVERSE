import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

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

export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "Use letters and at least one number.";
  return null;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * A random temporary password for an admin to hand over: 14 characters from a 54-symbol
 * alphabet without look-alikes (≈80 bits), shown as three groups so it is easy to read out.
 * Always contains a letter and a digit, so it passes the strength rules.
 */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let raw = "";
    for (let i = 0; i < 14; i++) raw += alphabet[randomInt(alphabet.length)];
    if (/[a-zA-Z]/.test(raw) && /[0-9]/.test(raw)) return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10)}`;
  }
}
