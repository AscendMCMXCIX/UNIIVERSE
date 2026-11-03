import { log } from "@/server/observability/log";

/**
 * The words an action may show for an error it caught. Database and driver errors carry SQL text,
 * parameter values or host names, so they are replaced by `fallback` and logged on the server
 * (the statement's text, never its parameters, which can hold Riot IDs). Errors the app throws for
 * people (validation, permissions, Riot's answers) keep their words.
 */
export function publicErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const e = (err ?? {}) as { name?: unknown; message?: unknown; code?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  if (message && !isInternal(e, message)) return message;
  log("error", "action.failed", { kind: typeof e.name === "string" ? e.name : "unknown", code: typeof e.code === "string" ? e.code : undefined, statement: message.split(/\nparams:/)[0]!.slice(0, 300) });
  return fallback;
}

function isInternal(e: { name?: unknown; code?: unknown }, message: string): boolean {
  if (e.name === "DrizzleQueryError" || e.name === "PostgresError") return true;
  if (/^Failed query:/.test(message)) return true;
  // Postgres SQLSTATE codes (23505…) and Node's network codes (ECONNREFUSED…).
  if (typeof e.code === "string" && /^(?:[0-9A-Z]{5}|E[A-Z]{3,})$/.test(e.code)) return true;
  return /\b(?:ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|getaddrinfo)\b|postgres(?:ql)?:\/\//i.test(message);
}
