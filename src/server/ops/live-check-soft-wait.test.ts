import { errors } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { softWait } from "../../../scripts/soft-wait.mjs";

/* The live check's soft wait (scripts/soft-wait.mjs): a timeout is the page's answer, any other error the check's own. */

const locator = (outcome: "ok" | "timeout" | Error) => ({
  waitFor: async () => {
    if (outcome === "ok") return;
    if (outcome === "timeout") throw new errors.TimeoutError("locator.waitFor: Timeout 20000ms exceeded.");
    throw outcome;
  },
});

describe("softWait", () => {
  it("says whether the locator arrived", async () => {
    await expect(softWait(locator("ok"), { timeout: 20_000 })).resolves.toBe(true);
    await expect(softWait(locator("timeout"), { timeout: 20_000 })).resolves.toBe(false);
  });

  it("throws a strict-mode violation instead of reading the page without having waited (27 Nov 2026)", async () => {
    const strict = new Error("locator.waitFor: Error: strict mode violation: getByTestId('lookup-panel') resolved to 2 elements");
    await expect(softWait(locator(strict), { timeout: 20_000 })).rejects.toThrow(/strict mode violation/);
  });

  it("throws any other error too: a closed page is the check's problem, not the page's answer", async () => {
    await expect(softWait(locator(new Error("Target page, context or browser has been closed")))).rejects.toThrow(/closed/);
  });
});
