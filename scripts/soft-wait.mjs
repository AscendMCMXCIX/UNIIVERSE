import { errors } from "@playwright/test";

/**
 * Waits for a locator before a fact reads the page, without stopping the live check when the wait
 * times out: the fact then fails, or says what it could not judge, with what the page showed.
 * Returns whether the locator reached the state.
 *
 * Only a timeout is the page's answer. Any other error is the check's own mistake and is thrown:
 * above all a strict-mode violation, which Playwright raises at once when the locator matches
 * several elements, so nothing was waited for. On 27 Nov 2026 Matchup Intel's old address waited on
 * `getByTestId("lookup-panel")`, which Compare's two columns both match. The swallowed error let the
 * check read the page before React had revealed it: both champions were there, in the streamed
 * block outside `main`, but `main h1` was not, and the fact failed on production by timing alone.
 */
export async function softWait(locator, options) {
  try {
    await locator.waitFor(options);
    return true;
  } catch (error) {
    if (error instanceof errors.TimeoutError) return false;
    throw error;
  }
}
