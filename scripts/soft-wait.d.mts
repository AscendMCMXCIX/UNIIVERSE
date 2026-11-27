/** Waits for a locator; false on a timeout, any other error thrown (scripts/soft-wait.mjs). */
export function softWait(locator: { waitFor(options?: { state?: "attached" | "detached" | "visible" | "hidden"; timeout?: number }): Promise<void> }, options?: { state?: "attached" | "detached" | "visible" | "hidden"; timeout?: number }): Promise<boolean>;
