import { describe, expect, it } from "vitest";
import { cardArt, championArtUrl, featuredChampion } from "./player-card";
import type { PlayerProfile } from "./roster/types";

type CardPlayer = PlayerProfile & { featuredChampionId?: string | null; featuredSkinNum?: number | null };
const player = (extra: Partial<CardPlayer> = {}): CardPlayer => ({
  id: "p",
  displayName: "P",
  primaryRole: "TOP",
  secondaryRole: "MID",
  primaryPool: ["Riven", "Gwen"],
  secondaryPool: ["Ahri"],
  additionalRoles: [],
  group: "main",
  ...extra,
});

describe("card art", () => {
  it("defaults to the first primary champion with its default art", () => {
    expect(cardArt(player())).toEqual({ championId: "Riven", skinNum: 0 });
  });

  it("uses the chosen champion and skin, any champion in the game", () => {
    expect(cardArt(player({ featuredChampionId: "Ahri", featuredSkinNum: 27 }))).toEqual({ championId: "Ahri", skinNum: 27 });
    expect(featuredChampion(player({ featuredChampionId: "Zed" }))).toBe("Zed");
  });

  it("never applies a skin without the champion it was chosen for", () => {
    expect(cardArt(player({ featuredChampionId: null, featuredSkinNum: 5 }))).toEqual({ championId: "Riven", skinNum: 0 });
  });

  it("has no art when the player has no champion at all", () => {
    expect(cardArt(player({ primaryPool: [], secondaryPool: [] }))).toBeNull();
  });

  it("builds official Data Dragon URLs: splash for headers, the small loading crop for thumbnails", () => {
    expect(championArtUrl({ championId: "Riven", skinNum: 16 }, "splash")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Riven_16.jpg");
    expect(championArtUrl({ championId: "MonkeyKing", skinNum: 0 }, "loading")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/loading/MonkeyKing_0.jpg");
    expect(championArtUrl({ championId: "Riven", skinNum: -3 }, "splash")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Riven_0.jpg");
    expect(championArtUrl({ championId: "Riven", skinNum: 16 }, "tiles")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/Riven_16.jpg");
  });
});
