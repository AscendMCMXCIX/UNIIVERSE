import { describe, expect, it } from "vitest";
import { opggLinkFor, opggProfileUrl, parseRiotId, platformOfMatchId, riotIdProblem, tagProblem } from "./opgg";

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
      // A 2-character tag, as Riot's own records hold them.
      ["Two#AB", "oc1", "https://op.gg/lol/summoners/oce/Two-AB"],
    ];
    for (const [riotId, platform, url] of cases) expect(opggProfileUrl(riotId, platform), riotId).toBe(url);
  });

  it("gives no link when the Riot ID is not reliable", () => {
    for (const bad of [null, undefined, "", "Faker", "Faker#", "#KR1", "a#b#c", "Name#A", "Name#TOOLONG", "Name#K-R", "Name#K R1", "Seventeen chars xx#OCE", "Bad\u0000Name#OCE", "Zero​Width#OCE", "   #OCE"]) {
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

  it("writes names in Unicode NFC, so a decomposed accent links to the same profile", () => {
    const decomposed = "The\u0301o#EUW";
    expect(opggProfileUrl(decomposed, "euw1")).toBe(opggProfileUrl("Th\u00e9o#EUW", "euw1"));
    expect(opggProfileUrl(decomposed, "euw1")).toBe("https://op.gg/lol/summoners/euw/Th%C3%A9o-EUW");
  });

  it("prefers a player's newer known Riot ID and server, and falls back to the match's own record", () => {
    expect(opggLinkFor("Old Name#OCE", "oc1", { riotId: "New Name#EUW", platform: "euw1" })).toBe("https://op.gg/lol/summoners/euw/New%20Name-EUW");
    // A linked account whose server Riot has not confirmed yet: its current Riot ID, on the match's server.
    expect(opggLinkFor("Old Name#OCE", "oc1", { riotId: "New Name#EUW", platform: null })).toBe("https://op.gg/lol/summoners/oce/New%20Name-EUW");
    // A known Riot ID that cannot make a link (no server OP.GG lists, or no tag) does not hide the match's own.
    expect(opggLinkFor("Old Name#OCE", "oc1", { riotId: "New Name#EUW", platform: "cn1" })).toBe("https://op.gg/lol/summoners/oce/Old%20Name-OCE");
    expect(opggLinkFor("Old Name#OCE", "oc1", { riotId: "NoTag", platform: "oc1" })).toBe("https://op.gg/lol/summoners/oce/Old%20Name-OCE");
    expect(opggLinkFor("Old Name#OCE", "oc1", null)).toBe("https://op.gg/lol/summoners/oce/Old%20Name-OCE");
    // Nothing reliable at all: no link rather than a guessed one.
    expect(opggLinkFor("Old Name", "oc1", { riotId: "NoTag", platform: "oc1" })).toBeNull();
  });

  it("accepts the Riot IDs the old check turned away: letters with their marks, joiners, sixteen characters as a reader counts them", () => {
    // Thai: 18 code points, 13 characters (vowel signs and tone marks belong to their letter).
    expect(opggProfileUrl("สวัสดีครับผมชื่อสม#TH2", "th2")).toBe(`https://op.gg/lol/summoners/th/${encodeURIComponent("สวัสดีครับผมชื่อสม")}-TH2`);
    // Persian and Arabic names keep the zero-width non-joiner they need.
    expect(opggProfileUrl("علی\u200cرضا#ME1", "me1")).toBe(`https://op.gg/lol/summoners/me/${encodeURIComponent("علی\u200cرضا")}-ME1`);
    // A tag in another script, with a mark on one of its letters.
    expect(parseRiotId("Somchai#ไทย1")).toEqual({ gameName: "Somchai", tagLine: "ไทย1" });
    expect(parseRiotId("Name#ก้า1")).toEqual({ gameName: "Name", tagLine: "ก้า1" });
    // Exactly sixteen is fine, seventeen is not; decomposed accents count once.
    expect(parseRiotId("abcdefghijklmnop#OCE")).not.toBeNull();
    expect(parseRiotId("abcdefghijklmnopq#OCE")).toBeNull();
    expect(parseRiotId("abcdefghijklmno\u0065\u0301#OCE")).not.toBeNull();
  });

  it("says why a recorded name makes no link, for the data audit", () => {
    const cases: Array<[string | null, ReturnType<typeof riotIdProblem>]> = [
      [null, "no-name"],
      ["", "no-name"],
      ["   #OCE", "no-name"],
      ["Faker", "no-tag"],
      ["Faker#", "no-tag"],
      ["Name#A", "tag-length"],
      ["Name#TOOLONG", "tag-length"],
      ["Name#K-R", "tag-characters"],
      ["Seventeen chars xx#OCE", "name-length"],
      ["Zero\u200bWidth#OCE", "name-characters"],
      ["Bidi\u202eName#OCE", "name-characters"],
      ["a#b#c", "name-characters"],
      ["Hide on bush#KR1", null],
    ];
    for (const [raw, problem] of cases) expect(riotIdProblem(raw), String(raw)).toBe(problem);
    // The tag alone, as the audit checks the tags it finds.
    expect([tagProblem("A"), tagProblem("AB"), tagProblem("OCE"), tagProblem("K-R"), tagProblem("ไทย")]).toEqual(["tag-length", null, null, "tag-characters", null]);
  });

  it("keeps the name as recorded apart from surrounding spaces", () => {
    expect(parseRiotId(" Hide on bush #KR1 ")).toEqual({ gameName: "Hide on bush", tagLine: "KR1" });
  });
});
