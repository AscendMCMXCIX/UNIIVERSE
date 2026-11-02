import { describe, expect, it } from "vitest";
import { checkSocialValue, isShownPublicly, normaliseSocialLinks, readSocialLinks, visibleSocialLinks, type SocialLinks } from "./social-links";

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

  it("accepts a Discord profile by its address or the account's number, and nothing else with a slash", () => {
    const id = "80351110224678912";
    for (const ok of [id, `discord.com/users/${id}`, `https://discord.com/users/${id}/`, `https://www.discordapp.com/users/${id}`]) expect(value(checkSocialValue("discord", ok)), ok).toBe(`https://discord.com/users/${id}`);
    for (const bad of ["discord.gg/team", `https://evil.example/users/${id}`, `https://discord.com/channels/${id}`, "https://discord.com/users/123", `javascript://discord.com/users/${id}`]) expect(checkSocialValue("discord", bad).ok, bad).toBe(false);
    expect(visibleSocialLinks({ discord: { value: `https://discord.com/users/${id}`, public: true } })).toEqual([{ kind: "discord", label: "Discord", text: "Discord profile", href: `https://discord.com/users/${id}` }]);
  });
});

describe("visibleSocialLinks", () => {
  const links: SocialLinks = {
    youtube: { value: "https://www.youtube.com/@MyChannel", public: true },
    twitch: { value: "https://www.twitch.tv/my_stream", public: false },
    discord: { value: "player.one", public: true },
  };

  it("shows a link switched on to everyone (team members and the public page alike), and one switched off to nobody", () => {
    expect(visibleSocialLinks(links).map((l) => l.kind)).toEqual(["youtube", "discord"]);
    expect(visibleSocialLinks({ twitch: { value: "https://www.twitch.tv/my_stream", public: false } })).toEqual([]);
  });

  it("shows nothing just because a value is stored", () => {
    expect(visibleSocialLinks(null)).toEqual([]);
    expect(visibleSocialLinks({ youtube: { value: "https://www.youtube.com/@MyChannel" } } as unknown as SocialLinks)).toEqual([]);
    // Only a real true: a string, or the old audiences in this shape, never count.
    expect(visibleSocialLinks({ youtube: { value: "https://www.youtube.com/@MyChannel", public: "true" } } as unknown as SocialLinks)).toEqual([]);
    expect(visibleSocialLinks({ youtube: { value: "https://www.youtube.com/@MyChannel", show: "public" } } as unknown as SocialLinks)).toEqual([]);
    // A value that no longer passes the checks (a hand-edited row) is hidden, never shown.
    expect(visibleSocialLinks({ youtube: { value: "https://evil.example/@x", public: true } })).toEqual([]);
    expect(visibleSocialLinks({ twitch: { value: "javascript:alert(1)", public: true } })).toEqual([]);
  });

  it("names each link for the page, with no more than it needs", () => {
    expect(visibleSocialLinks(links)).toEqual([
      { kind: "youtube", label: "YouTube", text: "@MyChannel", href: "https://www.youtube.com/@MyChannel" },
      { kind: "discord", label: "Discord", text: "@player.one", href: null },
    ]);
  });
});

describe("the old audiences (before migration 0061)", () => {
  it("count as shown publicly only when they were public: team-only and hidden links stay off", () => {
    expect(isShownPublicly({ value: "x", show: "public" })).toBe(true);
    expect(isShownPublicly({ value: "x", show: "team" })).toBe(false);
    expect(isShownPublicly({ value: "x", show: "hidden" })).toBe(false);
    expect(isShownPublicly({ value: "x", public: true })).toBe(true);
    for (const off of [{ value: "x" }, { value: "x", public: false }, { value: "x", public: "true" }, { value: "x", show: "everyone" }, null, "public", 1]) expect(isShownPublicly(off), JSON.stringify(off)).toBe(false);
  });

  it("are read into one switch per link, so a row the previous version wrote never shows more than it did", () => {
    const stored = { youtube: { value: "https://www.youtube.com/@MyChannel", show: "public" }, twitch: { value: "https://www.twitch.tv/my_stream", show: "team" }, discord: { value: "player.one", show: "hidden" } };
    expect(readSocialLinks(stored)).toEqual({ youtube: { value: "https://www.youtube.com/@MyChannel", public: true }, twitch: { value: "https://www.twitch.tv/my_stream", public: false }, discord: { value: "player.one", public: false } });
    expect(visibleSocialLinks(readSocialLinks(stored)).map((l) => l.kind)).toEqual(["youtube"]);
  });

  it("drop whatever is malformed", () => {
    expect(readSocialLinks(null)).toBeNull();
    expect(readSocialLinks([])).toBeNull();
    expect(readSocialLinks({})).toBeNull();
    expect(readSocialLinks({ youtube: "https://www.youtube.com/@x", twitch: { value: 3, public: true }, instagram: { value: "x", public: true } })).toBeNull();
  });
});

describe("normaliseSocialLinks", () => {
  it("checks every value, keeps each switch (off when unclear) and drops empty ones", () => {
    expect(normaliseSocialLinks({ youtube: { value: "@Me123", public: true }, twitch: { value: "", public: true }, discord: { value: "me.too", public: "yes" } })).toEqual({
      ok: true,
      links: { youtube: { value: "https://www.youtube.com/@Me123", public: true }, discord: { value: "me.too", public: false } },
    });
    expect(normaliseSocialLinks({ discord: { value: "new.link" } })).toEqual({ ok: true, links: { discord: { value: "new.link", public: false } } });
    expect(normaliseSocialLinks({})).toEqual({ ok: true, links: null });
  });

  it("reads a save from a page still showing the old form by the same rule: only public is on", () => {
    expect(normaliseSocialLinks({ youtube: { value: "@Me123", show: "public" }, discord: { value: "me.too", show: "team" } } as never)).toEqual({
      ok: true,
      links: { youtube: { value: "https://www.youtube.com/@Me123", public: true }, discord: { value: "me.too", public: false } },
    });
  });

  it("reports the first service with a problem", () => {
    const r = normaliseSocialLinks({ youtube: { value: "@ok_name", public: true }, twitch: { value: "twitch.tv/x", public: true } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.kind).toBe("twitch");
  });
});
