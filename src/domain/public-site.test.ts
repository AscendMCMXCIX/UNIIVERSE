import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_SITE, PLAYING_DEFAULTS, heroTitleFor, parseDiscordInvite, parsePublicSite, playingTextFor, validatePublicSite } from "./public-site";

describe("the public page's settings", () => {
  it("start neutral: no Discord invitation, no sign-off, the team's own name in the welcome", () => {
    const site = parsePublicSite(undefined);
    expect(site).toEqual(DEFAULT_PUBLIC_SITE);
    expect(site.discordUrl).toBeNull();
    expect(site.signOff).toBe("");
    expect(heroTitleFor(site, "Nova")).toBe("Welcome to Nova.");
    expect(heroTitleFor({ heroTitle: "Welcome home." }, "Nova")).toBe("Welcome home.");
  });

  it("accept only a Discord server invitation, kept in one https form", () => {
    expect(parseDiscordInvite("")).toEqual({ ok: true, value: null });
    expect(parseDiscordInvite("  https://discord.gg/AbC-123  ")).toEqual({ ok: true, value: "https://discord.gg/AbC-123" });
    expect(parseDiscordInvite("discord.gg/abc123/")).toEqual({ ok: true, value: "https://discord.gg/abc123" });
    expect(parseDiscordInvite("https://discord.com/invite/abc123")).toEqual({ ok: true, value: "https://discord.com/invite/abc123" });
    expect(parseDiscordInvite("https://www.discordapp.com/invite/abc123")).toEqual({ ok: true, value: "https://discord.com/invite/abc123" });
    for (const bad of ["https://discord.com/users/123456789012345678", "https://discord.com/channels/1/2", "https://example.com/invite/abc", "https://discord.gg.evil.com/abc", "javascript:alert(1)", "https://discord.gg/abc?x=<script>", "discord.gg/"]) {
      expect(parseDiscordInvite(bad).ok, bad).toBe(false);
    }
  });

  it("refuse a link that is not an invitation, and never keep one stored in error", () => {
    expect(validatePublicSite({ discordUrl: "https://discord.com/users/123456789012345678" })).toMatchObject({ ok: false });
    expect(parsePublicSite({ discordUrl: "https://example.com" }).discordUrl).toBeNull();
    const saved = validatePublicSite({ discordUrl: "discord.gg/friends", heroText: "  Hello  ", teamLabel: "  ", signOff: "Stay kind" });
    expect(saved).toEqual({ ok: true, value: expect.objectContaining({ discordUrl: "https://discord.gg/friends", heroText: "Hello", teamLabel: DEFAULT_PUBLIC_SITE.teamLabel, signOff: "Stay kind" }) });
  });

  it("cut every text to its limit and ignore unknown keys and wrong types", () => {
    const site = parsePublicSite({ heroText: "x".repeat(500), signOff: "y".repeat(100), playingOpen: "yes", extra: 1 });
    expect(site.heroText).toHaveLength(220);
    expect(site.signOff).toHaveLength(40);
    expect(site.playingOpen).toBe(true);
    expect(site).not.toHaveProperty("extra");
  });

  it("say what Playing With Us says for open and closed, unless an admin wrote their own", () => {
    expect(playingTextFor({ playingOpen: true, playingText: "" })).toBe(PLAYING_DEFAULTS.open);
    expect(playingTextFor({ playingOpen: false, playingText: "" })).toBe(PLAYING_DEFAULTS.closed);
    expect(playingTextFor({ playingOpen: false, playingText: "Back in spring." })).toBe("Back in spring.");
    // The default never promises a place on the team.
    expect(PLAYING_DEFAULTS.open).toMatch(/never out of try-outs/);
  });
});
