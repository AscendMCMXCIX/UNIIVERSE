/** Longest password accepted (a hashing-cost guard, far above anything a person types). */
export const MAX_PASSWORD_LENGTH = 256;
export const MIN_PASSWORD_LENGTH = 12;

/** The rules shown next to every new-password field. */
export const PASSWORD_RULES = "At least 12 characters. A few words make a good one. Common passwords are refused.";

/**
 * Length rules for a new or replaced password, checkable in the browser: 12 to 256 characters,
 * any characters at all. The server also refuses common passwords (server/auth/password.ts). Applied only when a password is created or changed; existing
 * passwords keep working whatever rules they were chosen under.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters. A few words together are easy to remember.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

/** Each rule with whether the password meets it, for the live checklist beside new-password fields. */
export function passwordChecks(password: string): Array<{ label: string; ok: boolean }> {
  return [{ label: `${MIN_PASSWORD_LENGTH}+ characters`, ok: password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH }];
}
