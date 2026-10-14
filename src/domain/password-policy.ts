/** Longest password accepted (a hashing-cost guard, far above anything a person types). */
export const MAX_PASSWORD_LENGTH = 256;
export const MIN_PASSWORD_LENGTH = 6;

/** The rules shown next to every new-password field. */
export const PASSWORD_RULES = "At least 6 characters, including a number and a symbol (for example ! ? # - _).";

/**
 * Rules for a new or replaced password: at least 6 characters, a number and a punctuation or
 * symbol character. Applied only when a password is created or changed; existing passwords keep
 * working whatever rules they were chosen under.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "Use at least 6 characters.";
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (!/\p{N}/u.test(password)) return "Include at least one number.";
  if (!/[^\p{L}\p{N}\s]/u.test(password)) return "Include at least one symbol, for example ! ? # - _.";
  return null;
}

/** Each rule with whether the password meets it, for the live checklist beside new-password fields. */
export function passwordChecks(password: string): Array<{ label: string; ok: boolean }> {
  return [
    { label: "6+ characters", ok: password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH },
    { label: "a number", ok: /\p{N}/u.test(password) },
    { label: "a symbol", ok: /[^\p{L}\p{N}\s]/u.test(password) },
  ];
}
