/** Types for scripts/redact.mjs (the live check is plain JavaScript run by node). */
export function redact(text: unknown): string;
/** Adds words redact() replaces with "<hidden>" from now on (the builds audit's champions). */
export function hideTerms(terms: readonly string[] | null | undefined): void;
