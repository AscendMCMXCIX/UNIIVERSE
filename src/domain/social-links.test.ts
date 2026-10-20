import { describe, expect, it } from "vitest";
import { checkSocialValue, normaliseSocialLinks, visibleSocialLinks, type SocialLinks } from "./social-links";

const value = (r: ReturnType<typeof checkSocialValue>) => (r.ok ? r.value : `error: ${r.error}`);

describe("checkSocialValue", () => {
  it("accepts YouTube handles and channel addresses on youtube.com only, normalised", () => {
    expect(value(checkSocialValue("youtube", "@MyChannel"))).toBe("https://www.youtube.com/@MyChannel");
    expect(value(checkSocialValue("youtube", "youtube.com/@my.channel-1"))).toBe("https://www.youtube.com/@my.channel-1");
    expect(value(checkSocialValue("youtube", "https://m.youtube.com/@MyChannel/"))).toBe("https://www.youtube.com/@MyChannel");
    expect(value(checkSocialValue("youtube", "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"))).toBe("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv");
    expect(value(checkSocialValue("youtube", "youtube.com/c/OldName"))).toBe("https://www.youtube.com/c/OldName");
    expect(value(checkSocialValue("youtube", "https://www.youtube.com/@café"))).toBe("https://www.youtube.com/@café");
    expect(value(checkSocialValue("youtube", "  "))).toBeNull();
  });

  it("never accepts another site, scheme or a disguised address", () => {
    for (const bad of ["https://evil.example/@me", "javascript:alert(1)", "https://www.youtube.com.evil.example/@me", "https://www.youtube.com@evil.example/@me", "//evil.example/@me", "https://www.youtube.com:8443/@me", "https://www.youtube.com/watch?v=abc", "@x"])
      expect(checkSocialValue("youtube", bad).ok, bad).toBe(false);
    for (const bad of ["https://twitch.tv.evil.example/me", "ftp://twitch.tv/name", "twitch.tv/_underscore", "abc", "a".repeat(26)]) expect(checkSocialValue("twitch", bad).ok, bad).toBe(false);
  });

  it("accepts Twitch names and channel addresses, lower-cased", () => {
    expect(value(checkSocialValue("twitch", "My_Stream"))).toBe("https://www.twitch.tv/my_stream");
    expect(value(checkSocialValue("twitch", "https://www.twitch.tv/My_Stream/"))).toBe("https://www.twitch.tv/my_stream");
  });

  it("accepts Discord usernames only, never the old #1234 tags", () => {
    expect(value(checkSocialValue("discord", "@Player.One"))).toBe("player.one");
    expect(value(checkSocialValue("discord", "x_y"))).toBe("x_y");
    for (const bad of ["Player#1234", "a", "two..dots", "has space", "x".repeat(33)]) expect(checkSocialValue("discord", bad).ok, bad).toBe(false);
  });
});

describe("visibleSocialLinks", () => {
  const links: SocialLinks = {
    youtube: { value: "https://www.youtube.com/@MyChannel", show: "public" },
    twitch: { value: "https://www.twitch.tv/my_stream", show: "team" },
    discord: { value: "player.one", show: "hidden" },
  };

  it("shows each link only to the audience its owner chose", () => {
    expect(visibleSocialLinks(links, "team").map((l) => l.kind)).toEqual(["youtube", "twitch"]);
    expect(visibleSocialLinks(links, "public").map((l) => l.kind)).toEqual(["youtube"]);
    expect(visibleSocialLinks({ discord: { value: "player.one", show: "team" } }, "team")).toEqual([{ kind: "discord", label: "Discord", text: "@player.one", href: null, public: false }]);
  });

  it("shows nothing just because a value is stored", () => {
    expect(visibleSocialLinks(null, "team")).toEqual([]);
    expect(visibleSocialLinks({ youtube: { value: "https://www.youtube.com/@MyChannel" } } as unknown as SocialLinks, "team")).toEqual([]);
    expect(visibleSocialLinks({ youtube: { value: "https://www.youtube.com/@MyChannel", show: "everyone" } } as unknown as SocialLinks, "team")).toEqual([]);
    // A value that no longer passes the checks (a hand-edited row) is hidden, never shown.
    expect(visibleSocialLinks({ youtube: { value: "https://evil.example/@x", show: "public" } }, "public")).toEqual([]);
    expect(visibleSocialLinks({ twitch: { value: "javascript:alert(1)", show: "public" } }, "public")).toEqual([]);
  });

  it("names each link for the page", () => {
    expect(visibleSocialLinks(links, "team")).toEqual([
      { kind: "youtube", label: "YouTube", text: "@MyChannel", href: "https://www.youtube.com/@MyChannel", public: true },
      { kind: "twitch", label: "Twitch", text: "my_stream", href: "https://www.twitch.tv/my_stream", public: false },
    ]);
  });
});

describe("normaliseSocialLinks", () => {
  it("checks every value, keeps the chosen audience (hidden when unclear) and drops empty ones", () => {
    expect(normaliseSocialLinks({ youtube: { value: "@Me123", show: "team" }, twitch: { value: "", show: "public" }, discord: { value: "me.too", show: "nonsense" } })).toEqual({
      ok: true,
      links: { youtube: { value: "https://www.youtube.com/@Me123", show: "team" }, discord: { value: "me.too", show: "hidden" } },
    });
    expect(normaliseSocialLinks({})).toEqual({ ok: true, links: null });
  });

  it("reports the first service with a problem", () => {
    const r = normaliseSocialLinks({ youtube: { value: "@ok_name", show: "team" }, twitch: { value: "twitch.tv/x", show: "team" } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("twitch");
  });
});
