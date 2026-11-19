/*
  Typed confirmations in Admin Mode: before something that cannot be taken back with one click (a
  setup or repair job, a job's schedule turned off, an account deleted with its profile), the
  administrator types a phrase or a name. The page enables its button only when the words match,
  and the server action checks them again, so a request made without the page is refused too.
  Letter case, spaces at either end and repeated spaces inside do not count: on a phone the keyboard
  capitalises the first letter, and the phrase is a deliberate pause, not a spelling test.
*/

const words = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();

/** Whether what was typed is the expected phrase or name (never for an empty one). */
export function typedMatches(typed: unknown, expected: string): boolean {
  return typeof typed === "string" && words(expected) !== "" && words(typed) === words(expected);
}

/** The phrase that turns a scheduled job off (its interval set to 0). */
export function turnOffPhrase(job: string): string {
  return `TURN OFF ${job}`;
}
