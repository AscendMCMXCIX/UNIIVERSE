import { describe, expect, it } from "vitest";
import { ASSET_RULES_FORMAT, StaticValidationError, staticProblems } from "./assets";
import { STATIC_DOWNLOAD_STALE_MS, STATIC_SILENT_MS, staticDataHealth } from "@/server/ops/static-health";

/*
  Validation before publishing the static data (assets.ts, staticProblems; docs/DATA_PIPELINES.md),
  and the state `/api/health` lists for the static refresh (server/ops/static-health.ts).
*/

const kindlegem = { name: "Kindlegem", description: "<mainText><stats><attention>200</attention> Health<br><attention>10</attention> Ability Haste</stats></mainText>", from: ["1028"], into: ["3067"], maps: { "11": true } };
const good = () => ({
  items: { data: { "3067": structuredClone(kindlegem) as typeof kindlegem, "1028": { name: "Ruby Crystal", description: "<mainText><stats><attention>150</attention> Health</stats></mainText>", into: ["3067"], maps: { "11": true } }, "3067x": { name: "Arena copy", maps: { "11": false } } } },
  summoner: { data: { SummonerFlash: { id: "SummonerFlash", key: "4", name: "Flash", cooldown: [300] } } },
  runes: [{ id: 8100, name: "Domination", slots: [{ runes: [{ id: 8112, name: "Electrocute" }] }] }],
});

describe("validation before keeping a version's static files", () => {
  it("a good file is kept: no problems", () => {
    const f = good();
    expect(staticProblems(f.items, f.summoner, f.runes)).toBeNull();
  });
  it("a file naming no champion, item or rune is refused (each file on its own)", () => {
    const f = good();
    expect(staticProblems({ data: {} }, f.summoner, f.runes)?.empty).toEqual(["item"]);
    expect(staticProblems(f.items, { data: {} }, f.runes)?.empty).toEqual(["summoner"]);
    expect(staticProblems(f.items, f.summoner, [])?.empty).toEqual(["rune"]);
    expect(staticProblems(null, "<html>", { error: true })?.empty).toEqual(["item", "summoner", "rune"]);
  });
  it("an id missing from that patch is refused: an item built from or into one it does not hold, a Rift item with no name", () => {
    const f = good();
    (f.items.data["3067"] as { from: string[] }).from = ["1028", "9999"];
    expect(staticProblems(f.items, f.summoner, f.runes)).toEqual({ empty: [], missingIds: 1, unparsedHaste: 0 });
    const g = good();
    (g.items.data["1028"] as { name: string }).name = "";
    expect(staticProblems(g.items, g.summoner, g.runes)?.missingIds).toBe(1);
  });
  it("an unparsable haste figure is refused", () => {
    const f = good();
    f.items.data["3067"] = { ...kindlegem, description: "<mainText><stats><attention>ten</attention> Ability Haste</stats></mainText>" };
    expect(staticProblems(f.items, f.summoner, f.runes)).toEqual({ empty: [], missingIds: 0, unparsedHaste: 1 });
    // Ability haste outside the stats is not a figure the rules read: not a problem.
    f.items.data["3067"] = { ...kindlegem, description: "<mainText><stats><attention>200</attention> Health</stats>Gain Ability Haste on kill</mainText>" };
    expect(staticProblems(f.items, f.summoner, f.runes)).toBeNull();
  });
  it("says what failed in counts and the version only", () => {
    const e = new StaticValidationError("16.23.1", { empty: ["rune"], missingIds: 2, unparsedHaste: 1 });
    expect(e.message).toBe("Data Dragon 16.23.1's item, summoner and rune files failed validation (naming no rune; 2 missing ids; 1 unreadable haste figures); the last good copy stays.");
  });
});

describe("the static refresh's state for /api/health", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const base = { currentVersion: "16.23.1", storedVersion: "16.23.1", attempt: null, lastSuccessAt: now - 3_600_000, turnedOff: false, now };
  const attempt = (reason: "validation" | "download", ageMs: number) => ({ version: "16.23.1", reason, firstAt: new Date(now - ageMs).toISOString(), lastAt: new Date(now).toISOString(), problems: reason === "validation" ? { empty: [], missingIds: 1, unparsedHaste: 0 } : null });

  it("ok: the current version's files kept and a run within the hour (a normal week)", () => {
    expect(staticDataHealth(base)).toEqual({ state: "ok", patch: "26.23", stored: "26.23", reason: null, problems: null });
  });
  it("failed at once: the current version's files failed validation, the last good copy in use", () => {
    expect(staticDataHealth({ ...base, storedVersion: "16.22.1", attempt: attempt("validation", 60_000) })).toEqual({ state: "failed", patch: "26.23", stored: "26.22", reason: "validation", problems: { empty: [], missingIds: 1, unparsedHaste: 0 } });
  });
  it("a download failing: ok for 24 hours, stale after", () => {
    expect(staticDataHealth({ ...base, storedVersion: "16.22.1", attempt: attempt("download", STATIC_DOWNLOAD_STALE_MS - 60_000) }).state).toBe("ok");
    expect(staticDataHealth({ ...base, storedVersion: "16.22.1", attempt: attempt("download", STATIC_DOWNLOAD_STALE_MS + 60_000) })).toMatchObject({ state: "stale", reason: "download" });
  });
  it("an attempt for another version, or once the current one is kept, is not listed", () => {
    expect(staticDataHealth({ ...base, attempt: attempt("validation", 60_000) }).state).toBe("ok");
    expect(staticDataHealth({ ...base, currentVersion: "16.24.1", storedVersion: "16.23.1", attempt: attempt("validation", 60_000) }).state).toBe("ok");
  });
  it("a copy of the current version in an older format (R11a's format 3) counts as behind: its failed download is listed by the same rule", () => {
    expect(staticDataHealth({ ...base, storedFormat: 2, attempt: attempt("download", STATIC_DOWNLOAD_STALE_MS - 60_000) }).state).toBe("ok");
    expect(staticDataHealth({ ...base, storedFormat: 2, attempt: attempt("download", STATIC_DOWNLOAD_STALE_MS + 60_000) })).toMatchObject({ state: "stale", reason: "download", stored: "26.23" });
    expect(staticDataHealth({ ...base, storedFormat: null, attempt: attempt("validation", 60_000) })).toMatchObject({ state: "failed", reason: "validation" });
    expect(staticDataHealth({ ...base, storedFormat: ASSET_RULES_FORMAT, attempt: attempt("validation", 60_000) }).state).toBe("ok");
    expect(staticDataHealth({ ...base, storedFormat: 2 }).state).toBe("ok");
  });
  it("no version-check success for 72 hours: stale, unless version-check is off by choice (a notice) or has never run", () => {
    expect(staticDataHealth({ ...base, lastSuccessAt: now - STATIC_SILENT_MS + 3_600_000 }).state).toBe("ok");
    expect(staticDataHealth({ ...base, lastSuccessAt: now - STATIC_SILENT_MS - 60_000 })).toMatchObject({ state: "stale", reason: "no-success" });
    expect(staticDataHealth({ ...base, lastSuccessAt: now - STATIC_SILENT_MS - 60_000, turnedOff: true }).state).toBe("ok");
    expect(staticDataHealth({ ...base, lastSuccessAt: null }).state).toBe("ok");
  });
  it("a version-check interval longer than a day waits three intervals, never alerting between normal runs (R11b review 3)", () => {
    const week = 7 * 24 * 60;
    expect(staticDataHealth({ ...base, intervalMinutes: week, lastSuccessAt: now - 6 * 24 * 3_600_000 }).state).toBe("ok");
    expect(staticDataHealth({ ...base, intervalMinutes: week, lastSuccessAt: now - 22 * 24 * 3_600_000 })).toMatchObject({ state: "stale", reason: "no-success" });
  });
});
