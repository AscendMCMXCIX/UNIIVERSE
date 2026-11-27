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

describe("closing the preview leaves the list where the reader is (keepListPlace)", () => {
  it("the list's entry restores no scroll while the preview's entry is on top of it; the preview's keeps the browser's own; closing gives the list's back", async () => {
    const { keepListPlace } = await import("./preview-data");
    // The History API's scroll restoration belongs to the current entry: the list's until the push, the preview's after it.
    const entries: Array<{ mode: ScrollRestoration }> = [{ mode: "auto" }];
    const history = {
      get scrollRestoration() {
        return entries.at(-1)!.mode;
      },
      set scrollRestoration(mode: ScrollRestoration) {
        entries.at(-1)!.mode = mode;
      },
    };
    const restore = keepListPlace(history, () => entries.push({ mode: history.scrollRestoration }));
    expect(entries.map((e) => e.mode), "the list's entry manual, the preview's the browser's own").toEqual(["manual", "auto"]);
    // Back over the preview's entry: the list's is current again, and gets the browser's restoration back once the preview has closed.
    entries.pop();
    restore();
    expect(entries.map((e) => e.mode)).toEqual(["auto"]);
  });
});

describe("the preview's close rule (listQuery, closeGoesBack)", () => {
  it("goes Back only while the list's query is the one the preview's entry was pushed over", async () => {
    const { closeGoesBack, listQuery } = await import("./preview-data");
    // The list's own query, without the preview's keys, in one order.
    expect(listQuery("?season=16&mode=all&champion=Ambessa&crole=TOP&vs=Darius")).toBe("mode=all&season=16");
    expect(listQuery("?mode=all&season=16")).toBe(listQuery("?season=16&mode=all&tab=matchups"));
    const pushedOver = listQuery("?season=16&mode=all");
    // Opened, then closed with the same filters: Back (the list's entry is under it).
    expect(closeGoesBack(pushedOver, "?season=16&mode=all&champion=Ambessa&crole=TOP")).toBe(true);
    expect(closeGoesBack(pushedOver, "?mode=all&champion=Ambessa&season=16&vs=Darius")).toBe(true);
    // A filter changed while it was open (the champion kept, O2): Back would bring the old filters back, so it replaces.
    expect(closeGoesBack(pushedOver, "?season=16&mode=solo&champion=Ambessa&crole=TOP")).toBe(false);
    expect(closeGoesBack(pushedOver, "?season=16&mode=all&role=TOP&champion=Ambessa")).toBe(false);
    // Not pushed by this page (a linked preview): never Back.
    expect(closeGoesBack(null, "?season=16&mode=all&champion=Ambessa")).toBe(false);
  });
});
