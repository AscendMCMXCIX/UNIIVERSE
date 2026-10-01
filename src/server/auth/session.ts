import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Authentication.
 *
 * UNIIVERSE is private. The simplest robust setup for a small team is a shared access password
 * (owner) plus an optional read-only password (viewer), both held in environment variables and
 * never committed. Sessions are signed JWT cookies. The abstraction below is the only place the
 * rest of the app talks to, so a provider such as Supabase Auth can replace it later.
 */
export type AccessRole = "owner" | "editor" | "viewer";

export interface Session {
  role: AccessRole;
  label: string;
  issuedAt: number;
}

export const SESSION_COOKIE = "uniiverse_session";
const SESSION_DAYS = 30;

export type AuthMode = "open" | "password" | "locked";

/**
 * - password: at least one password is configured → login required.
 * - open:     no password configured and not running in production → everyone is owner (local/demo).
 * - locked:   no password configured in production → show the setup page instead of the app.
 */
export function authMode(): AuthMode {
  if (process.env.UNIIVERSE_ACCESS_PASSWORD || process.env.UNIIVERSE_VIEWER_PASSWORD || process.env.UNIIVERSE_EDITOR_PASSWORD) return "password";
  const isProduction = process.env.NODE_ENV === "production" && (process.env.VERCEL_ENV === "production" || process.env.UNIIVERSE_REQUIRE_AUTH === "true");
  return isProduction ? "locked" : "open";
}

function secret(): Uint8Array {
  const raw = process.env.UNIIVERSE_AUTH_SECRET || process.env.UNIIVERSE_ACCESS_PASSWORD || "uniiverse-local-development-secret";
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(session: Omit<Session, "issuedAt">): Promise<string> {
  return new SignJWT({ role: session.role, label: session.label })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = payload.role;
    if (role !== "owner" && role !== "editor" && role !== "viewer") return null;
    return { role, label: typeof payload.label === "string" ? payload.label : role, issuedAt: typeof payload.iat === "number" ? payload.iat : 0 };
  } catch {
    return null;
  }
}

/** Resolves the role for a submitted password, or null when it matches nothing. */
export function roleForPassword(password: string): AccessRole | null {
  const check = (expected: string | undefined) => !!expected && safeEqual(expected, password);
  if (check(process.env.UNIIVERSE_ACCESS_PASSWORD)) return "owner";
  if (check(process.env.UNIIVERSE_EDITOR_PASSWORD)) return "editor";
  if (check(process.env.UNIIVERSE_VIEWER_PASSWORD)) return "viewer";
  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function getSession(): Promise<Session | null> {
  const mode = authMode();
  if (mode === "open") return { role: "owner", label: "Local owner (no password configured)", issuedAt: 0 };
  if (mode === "locked") return null;
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function canEdit(session: Session | null): boolean {
  return !!session && (session.role === "owner" || session.role === "editor");
}

export function isOwner(session: Session | null): boolean {
  return session?.role === "owner";
}

export class NotAuthorizedError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "NotAuthorizedError";
  }
}

export async function requireEditor(): Promise<Session> {
  const session = await getSession();
  if (!canEdit(session)) throw new NotAuthorizedError();
  return session!;
}

export async function requireOwner(): Promise<Session> {
  const session = await getSession();
  if (!isOwner(session)) throw new NotAuthorizedError("Only the owner can do that.");
  return session!;
}
