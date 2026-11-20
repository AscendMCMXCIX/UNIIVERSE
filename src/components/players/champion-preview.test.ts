import { describe, expect, it, vi } from "vitest";
import type { PreviewResult } from "@/server/actions/champion-preview";
import { answerFrom, cacheFor } from "./champion-preview";

const ok = (data: string): PreviewResult<string> => ({ status: "ok", data });

describe("the preview's answers (cacheFor, answerFrom)", () => {
  it("keeps an answer while the list's data is the same: switching back asks nothing again", async () => {
    const data = {};
    const cache = cacheFor<string>(null, data, [["gwen", "seeded"]]);
    const run = vi.fn(async () => ok("asked"));
    expect(await answerFrom(cache, "gwen", run)).toEqual(ok("seeded"));
    expect(await answerFrom(cache, "nasus", run)).toEqual(ok("asked"));
    expect(await answerFrom(cache, "nasus", run)).toEqual(ok("asked"));
    expect(run).toHaveBeenCalledTimes(1);
    // A render with the same data (the address changing, a re-render) keeps the same answers.
    expect(cacheFor(cache, data, [["gwen", "other"]])).toBe(cache);
  });

  it("starts afresh when a server render brings new data (a refresh after new games), with that render's answers", async () => {
    const before = cacheFor<string>(null, { games: 14 }, [["gwen", "14 games"]]);
    await answerFrom(before, "nasus", async () => ok("old tally"));
    const after = cacheFor(before, { games: 15 }, [["gwen", "15 games"]]);
    expect(after).not.toBe(before);
    // The refreshed render's answer replaces the one kept, so the tally agrees with the figures above it.
    expect(await answerFrom(after, "gwen", async () => ok("asked"))).toEqual(ok("15 games"));
    // The others are asked again when shown.
    const run = vi.fn(async () => ok("new tally"));
    expect(await answerFrom(after, "nasus", run)).toEqual(ok("new tally"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("keeps only answers: a refusal or a failed load is asked again next time", async () => {
    const cache = cacheFor<string>(null, {}, []);
    expect(await answerFrom(cache, "gwen", async () => ({ status: "not-found", message: "No." }) as PreviewResult<string>)).toMatchObject({ status: "not-found" });
    expect((await answerFrom(cache, "gwen", () => Promise.reject(new Error("offline")))).status).toBe("not-found");
    expect(await answerFrom(cache, "gwen", async () => ok("asked"))).toEqual(ok("asked"));
  });
});
