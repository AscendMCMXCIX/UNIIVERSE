import { describe, expect, it } from "vitest";
import { DATA_STATUS_LABEL, dataStatus, teamDataStatus } from "./data-status";
import type { AccountSyncView } from "./account-status";

const view = (state: AccountSyncView["state"], detail = "detail"): AccountSyncView => ({ state, label: state, tone: "neutral", detail, lastUpdatedAt: null });
const synced = view("synced");
const complete = { complete: true, label: "Complete season", detail: "Every supported game this season." };
const multikills = (counted: number, games: number, unavailable = 0) => ({ games, counted, unavailable, double: 3, triple: 1, quadra: 0, penta: 0 });
const at = { checkedAt: "2026-10-22T04:00:00.000Z", newestGameAt: "2026-10-22T02:00:00.000Z" };

describe("dataStatus", () => {
  it("is up to date when every account was read and every figure is complete", () => {
    const s = dataStatus({ ...at, accounts: [synced, synced], season: complete, multikills: multikills(40, 40), details: { games: 40, detailed: 40 } });
    expect(s.state).toBe("current");
    expect(s.label).toBe("Up to date");
    expect(s.parts.map((p) => p.key)).toEqual(["accounts"]);
    expect(s.checkedAt).toBe(at.checkedAt);
    // No attempt recorded apart from the last read: nothing to tell apart.
    expect(s.attemptedAt).toBeNull();
  });

  it("keeps the latest attempt apart from the last successful read", () => {
    const s = dataStatus({ ...at, attemptedAt: "2026-10-22T05:30:00.000Z", accounts: [view("stale")] });
    expect(s.checkedAt).toBe(at.checkedAt);
    expect(s.attemptedAt).toBe("2026-10-22T05:30:00.000Z");
    expect(s.state).toBe("delayed");
  });

  it("names partial multikills with both numbers, never as the season's total", () => {
    const s = dataStatus({ ...at, accounts: [synced], season: complete, multikills: multikills(277, 1104, 3) });
    expect(s.state).toBe("partial");
    expect(s.label).toBe("Partial data");
    expect(s.headline).toBe("Multikills counted in 277 of 1,104 games");
    const part = s.parts.find((p) => p.key === "multikills")!;
    expect(part.detail).toMatch(/still being fetched from Riot/);
    expect(part.detail).toMatch(/no longer provides/);
  });

  it("says when no game has multikill counts yet", () => {
    const s = dataStatus({ ...at, accounts: [synced], multikills: multikills(0, 12) });
    expect(s.headline).toBe("No multikill counts yet for these 12 games");
  });

  it("lists game details still being collected as partial", () => {
    const s = dataStatus({ ...at, accounts: [synced], details: { games: 100, detailed: 61 } });
    expect(s.state).toBe("partial");
    expect(s.headline).toBe("Kills, KDA, CS, damage and vision from 61 of 100 games");
    expect(s.parts.at(-1)!.detail).toMatch(/39 older games are still being collected/);
  });

  it("tells games Riot no longer serves apart from games still to collect, and never promises the former", () => {
    // One game's record is gone for good: nothing is "still being collected".
    const gone = dataStatus({ ...at, accounts: [synced], details: { games: 40, detailed: 39, unavailable: 1 } });
    expect(gone.state).toBe("partial");
    expect(gone.headline).toBe("Kills, KDA, CS, damage and vision from 39 of 40 games");
    expect(gone.parts.at(-1)!.detail).toBe("Riot no longer provides the record of 1 game, so its figures are left out; the results still count.");
    // Both at once: each said with its own count.
    const both = dataStatus({ ...at, accounts: [synced], details: { games: 100, detailed: 61, unavailable: 2 } });
    expect(both.parts.at(-1)!.detail).toBe("Riot's full record of 37 older games are still being collected; the results already count. Riot no longer provides the records of 2 games, so their figures are left out; the results still count.");
  });

  it("puts syncing before partial, a delay before partial, and an account that needs a person before everything", () => {
    expect(dataStatus({ ...at, accounts: [synced, view("syncing")], multikills: multikills(1, 2) }).state).toBe("syncing");
    expect(dataStatus({ ...at, accounts: [view("stale")], multikills: multikills(1, 2) }).state).toBe("delayed");
    const s = dataStatus({ ...at, accounts: [view("syncing"), view("error", "Riot could not find this Riot ID.")], multikills: multikills(1, 2) });
    expect(s.state).toBe("attention");
    expect(s.headline).toBe("A Riot account needs attention");
    expect(s.parts[0]!.detail).toBe("Riot could not find this Riot ID.");
  });

  it("explains a first read and a season still being collected without calling it partial", () => {
    expect(dataStatus({ ...at, accounts: [view("pending")] }).headline).toBe("Reading the linked Riot account for the first time");
    const collecting = dataStatus({ ...at, accounts: [view("syncing")], season: { complete: false, label: "Partial Data", detail: "Still collecting older games from 1 of 1 linked account; the numbers grow by themselves." } });
    expect(collecting.state).toBe("syncing");
    expect(collecting.parts.map((p) => p.key)).toEqual(["accounts"]);
    expect(collecting.parts[0]!.detail).toMatch(/Still collecting older games/);
  });

  it("marks an earlier season kept only in part as partial, and positions left out of a role", () => {
    const s = dataStatus({ ...at, accounts: [synced], season: { complete: false, label: "Partial Data", detail: "Season 2025: only the games stored while these accounts were tracked." }, unknownRole: 1 });
    expect(s.state).toBe("partial");
    expect(s.parts.map((p) => p.label)).toEqual(["Games, rank and mastery are up to date", "Only part of the season's games are stored", "1 game without a recorded position left out of this role"]);
  });

  it("has nothing to read without a Riot account", () => {
    const s = dataStatus({ accounts: [], checkedAt: null, newestGameAt: null });
    expect(s.state).toBe("none");
    expect(s.label).toBe(DATA_STATUS_LABEL.none);
    expect(s.parts).toEqual([]);
  });
});

describe("teamDataStatus", () => {
  const times = { checkedAt: at.checkedAt, attemptedAt: at.checkedAt, newestGameAt: at.newestGameAt };

  it("is up to date when every member account is, and says the boards follow the account syncs", () => {
    const s = teamDataStatus({ ...times, accounts: [synced, synced, synced] });
    expect(s.state).toBe("current");
    expect(s.label).toBe("Up to date");
    expect(s.parts.map((p) => p.label)).toEqual(["Every member's games, rank and mastery are up to date", "The boards follow the account syncs"]);
    expect(s.parts.at(-1)!.detail).toMatch(/after the player's next account sync, not live/);
  });

  it("counts the accounts in each state without naming anyone, the one that needs a person first", () => {
    const s = teamDataStatus({ ...times, accounts: [synced, view("syncing"), view("pending"), view("stale"), view("error", "Riot could not find this Riot ID.")] });
    expect(s.state).toBe("attention");
    expect(s.headline).toBe("1 member account needs attention");
    expect(s.parts.map((p) => p.label)).toEqual(["1 member account needs attention", "2 member accounts still being read", "1 member account not read for a while", "The boards follow the account syncs"]);
    // Each account's own story (and its Riot ID) stays on its player's profile.
    expect(s.parts.map((p) => p.detail).join(" ")).not.toMatch(/could not find this Riot ID/);
    expect(teamDataStatus({ ...times, accounts: [synced, view("stale"), view("syncing")] }).state).toBe("syncing");
    expect(teamDataStatus({ ...times, accounts: [synced, view("stale")] }).state).toBe("delayed");
  });

  it("passes the times through, and has nothing to read without member accounts", () => {
    const s = teamDataStatus({ checkedAt: null, attemptedAt: "2026-10-22T05:00:00.000Z", newestGameAt: null, accounts: [view("pending")] });
    expect(s).toMatchObject({ checkedAt: null, attemptedAt: "2026-10-22T05:00:00.000Z", newestGameAt: null, state: "syncing" });
    const none = teamDataStatus({ checkedAt: null, attemptedAt: null, newestGameAt: null, accounts: [] });
    expect(none.state).toBe("none");
    expect(none.parts).toEqual([]);
  });
});
