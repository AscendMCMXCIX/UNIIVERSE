import { describe, expect, it } from "vitest";
import type { OverviewCard } from "@/server/players/overview";
import { sortChampions } from "./all-champions";

const card = (championId: string, games: number, winRate: number | null, tier: string, mastery: number | null, kda: number | null = null): OverviewCard =>
  ({ championId, role: "MID", tier, selected: { games, winRate }, performance: { kdaRatio: kda, csPerMinute: null }, mastery: mastery === null ? null : { points: mastery } }) as unknown as OverviewCard;
const rows = [card("Ahri", 10, 0.6, "strong", 50_000, 3), card("Zed", 0, null, "unknown", null), card("Azir", 4, 0.25, "core", 900_000, 2.5), card("Lux", 10, 0.5, "rusty", 120_000, null)];
const names = (r: OverviewCard[]) => r.map((c) => c.championId);
const nameOf = (id: string) => id;

describe("All Champions sorting", () => {
  it("sorts both ways by champion name", () => {
    expect(names(sortChampions(rows, "champion", "asc", nameOf))).toEqual(["Ahri", "Azir", "Lux", "Zed"]);
    expect(names(sortChampions(rows, "champion", "desc", nameOf))).toEqual(["Zed", "Lux", "Azir", "Ahri"]);
  });
  it("breaks equal values by name and keeps missing figures last in either direction", () => {
    expect(names(sortChampions(rows, "games", "desc", nameOf))).toEqual(["Ahri", "Lux", "Azir", "Zed"]);
    expect(names(sortChampions(rows, "games", "asc", nameOf))).toEqual(["Zed", "Azir", "Ahri", "Lux"]);
    // Zed has no games: no win rate, so it is last both ways (never above a real 60%).
    expect(names(sortChampions(rows, "win", "desc", nameOf))).toEqual(["Ahri", "Lux", "Azir", "Zed"]);
    expect(names(sortChampions(rows, "win", "asc", nameOf))).toEqual(["Azir", "Lux", "Ahri", "Zed"]);
    expect(names(sortChampions(rows, "kda", "asc", nameOf)).slice(-2).sort()).toEqual(["Lux", "Zed"]);
  });
  it("orders proficiency by its tiers, not alphabetically, with Not played last", () => {
    expect(names(sortChampions(rows, "proficiency", "desc", nameOf))).toEqual(["Azir", "Ahri", "Lux", "Zed"]);
    expect(names(sortChampions(rows, "proficiency", "asc", nameOf))).toEqual(["Lux", "Ahri", "Azir", "Zed"]);
  });
  it("sorts total kills both ways, a champion without counts last either way", () => {
    const kills = (championId: string, totalKills: number | null) => ({ championId, role: "MID", tier: "strong", selected: { games: 3, winRate: 0.5 }, performance: { kdaRatio: 2, csPerMinute: null, totalKills, detailedGames: totalKills === null ? 0 : 3 }, mastery: null }) as unknown as OverviewCard;
    const list = [kills("Ahri", 21), kills("Zed", null), kills("Azir", 40), kills("Lux", 0)];
    expect(names(sortChampions(list, "kills", "desc", nameOf))).toEqual(["Azir", "Ahri", "Lux", "Zed"]);
    expect(names(sortChampions(list, "kills", "asc", nameOf))).toEqual(["Lux", "Ahri", "Azir", "Zed"]);
  });
  it("sorts mastery points both ways", () => {
    expect(names(sortChampions(rows, "mastery", "desc", nameOf))).toEqual(["Azir", "Lux", "Ahri", "Zed"]);
    expect(names(sortChampions(rows, "mastery", "asc", nameOf))).toEqual(["Ahri", "Lux", "Azir", "Zed"]);
  });
});
