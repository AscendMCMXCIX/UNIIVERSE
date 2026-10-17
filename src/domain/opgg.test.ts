import { describe, expect, it } from "vitest";
import { opggProfileUrl, parseRiotId, platformOfMatchId } from "./opgg";

describe("OP.GG profile links from completed matches", () => {
  it("builds the profile address from the recorded Riot ID and the match's server", () => {
    // Real-world formats: spaces, accents, Hangul, kana, Cyrillic tags, symbols, digit tags, lower-case tags.
    const cases: Array<[string, string, string]> = [
      ["Hide on bush#KR1", "kr", "https://op.gg/lol/summoners/kr/Hide%20on%20bush-KR1"],
      ["Hide on bush#КR1", "kr", "https://op.gg/lol/summoners/kr/Hide%20on%20bush-%D0%9AR1"],
      ["†#EUW", "euw1", "https://op.gg/lol/summoners/euw/%E2%80%A0-EUW"],
      ["Jokić#Ricky", "la1", "https://op.gg/lol/summoners/lan/Joki%C4%87-Ricky"],
      ["Spear Shot#1111", "euw1", "https://op.gg/lol/summoners/euw/Spear%20Shot-1111"],
      ["Skitposting#slugs", "na1", "https://op.gg/lol/summoners/na/Skitposting-slugs"],
      ["페이커#KR1", "kr", "https://op.gg/lol/summoners/kr/%ED%8E%98%EC%9D%B4%EC%BB%A4-KR1"],
      ["名前テスト#JP1", "jp1", "https://op.gg/lol/summoners/jp/%E5%90%8D%E5%89%8D%E3%83%86%E3%82%B9%E3%83%88-JP1"],
      ["Thé Ünïcode#OCE", "oc1", "https://op.gg/lol/summoners/oce/Th%C3%A9%20%C3%9Cn%C3%AFcode-OCE"],
      ["a&b?c/d#OCE", "oc1", "https://op.gg/lol/summoners/oce/a%26b%3Fc%2Fd-OCE"],
      ["opgg#LAS", "la2", "https://op.gg/lol/summoners/las/opgg-LAS"],
    ];
    for (const [riotId, platform, url] of cases) expect(opggProfileUrl(riotId, platform), riotId).toBe(url);
  });

  it("gives no link when the Riot ID is not reliable", () => {
    for (const bad of [null, undefined, "", "Faker", "Faker#", "#KR1", "a#b#c", "Name#AB", "Name#TOOLONG", "Name#K-R", "Name#K R1", "Seventeen chars xx#OCE", "Bad\u0000Name#OCE", "Zero​Width#OCE", "   #OCE"]) {
      expect(parseRiotId(bad), String(bad)).toBeNull();
      expect(opggProfileUrl(bad, "oc1")).toBeNull();
    }
  });

  it("gives no link without a known server", () => {
    expect(opggProfileUrl("Hide on bush#KR1", null)).toBeNull();
    expect(opggProfileUrl("Hide on bush#KR1", "cn1")).toBeNull();
  });

  it("reads the server from a Riot match id, not from demo ids", () => {
    expect(platformOfMatchId("OC1_612345678")).toBe("oc1");
    expect(platformOfMatchId("EUW1_7012345678")).toBe("euw1");
    expect(platformOfMatchId("KR_7412345678")).toBe("kr");
    expect(platformOfMatchId("LA2_1234")).toBe("la2");
    expect(platformOfMatchId("DEMO_91003")).toBeNull();
    expect(platformOfMatchId("DEMO_1a2b3c4d_7")).toBeNull();
    expect(platformOfMatchId("XX1_123")).toBeNull();
    expect(platformOfMatchId("OC1_123/../x")).toBeNull();
    // Strict Riot format only: no letters in the game id, no lower-case server.
    expect(platformOfMatchId("OC1_H19")).toBeNull();
    expect(platformOfMatchId("OC1_12a")).toBeNull();
    expect(platformOfMatchId("oc1_123")).toBeNull();
    expect(platformOfMatchId("OC1_")).toBeNull();
  });

  it("keeps the name as recorded apart from surrounding spaces", () => {
    expect(parseRiotId(" Hide on bush #KR1 ")).toEqual({ gameName: "Hide on bush", tagLine: "KR1" });
  });
});
