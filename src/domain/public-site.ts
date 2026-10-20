/*
  The public page's own words (Admin → Branding → Public page): the welcome, the community's Discord
  invitation, and whether the team is open to new players right now. Names, logo, colours and
  images come from the branding itself, so nothing here is a design setting, and nothing here names
  an install: every default is neutral, with the team's name filled in where it reads naturally.
  Pure: parsing, defaults and the checks an admin's input must pass.
*/

export interface PublicSite {
  /** The hero's heading. Empty: "Welcome to <team name>." */
  heroTitle: string;
  /** One or two sentences under the heading. */
  heroText: string;
  /** The hero's two buttons: to the lineup, and to the Discord (shown only with an invitation). */
  teamLabel: string;
  communityLabel: string;
  /**
   * The community's Discord invitation, as an admin pasted it (discord.gg/… or discord.com/invite/…).
   * Null: no invitation, and no Discord button anywhere. Never made up.
   */
  discordUrl: string | null;
  /** What the community section says. */
  communityText: string;
  /** Whether the team welcomes people who would like to play with it, now. */
  playingOpen: boolean;
  /** What Playing With Us says. Empty: the default for open or closed. */
  playingText: string;
  /** A closing line in the footer, the community's own sign-off. Empty: none. */
  signOff: string;
}

export const PUBLIC_SITE_LIMITS = {
  heroTitle: 80,
  heroText: 220,
  teamLabel: 28,
  communityLabel: 28,
  communityText: 420,
  playingText: 420,
  signOff: 40,
} as const;

export const DEFAULT_PUBLIC_SITE: PublicSite = {
  heroTitle: "",
  heroText: "A community built around friendship, gaming and the moments we share.",
  teamLabel: "Meet the Team",
  communityLabel: "Join Our Community",
  discordUrl: null,
  communityText: "Our Discord is where it all happens: conversation, games, creativity and connection. Come to talk games, share a moment, or just hang out for a while. Everyone is welcome.",
  playingOpen: true,
  playingText: "",
  signOff: "",
};

/**
 * What Playing With Us says when an admin has not written their own. The page always adds that
 * joining the Discord is joining the community, not the League team, whatever the words.
 */
export const PLAYING_DEFAULTS = {
  open: "We're always glad to meet people who enjoy playing together. If you'd like to play with us, join the Discord, say hello and queue up with whoever's around. The lineup grows out of friendships over time, never out of try-outs.",
  closed: "The lineup is settled for now, so we're not looking for new players. You're still welcome in the community, and that's where it starts whenever that changes.",
} as const;

/** The heading the hero shows. */
export function heroTitleFor(site: Pick<PublicSite, "heroTitle">, teamName: string): string {
  return site.heroTitle || `Welcome to ${teamName}.`;
}

/** The words Playing With Us shows for the team's current state. */
export function playingTextFor(site: Pick<PublicSite, "playingOpen" | "playingText">): string {
  return site.playingText || PLAYING_DEFAULTS[site.playingOpen ? "open" : "closed"];
}

/**
 * A Discord server invitation: discord.gg/<code>, or discord.com/invite/<code> (also on
 * discordapp.com). An invitation code is letters, digits and hyphens. Anything else (a channel, a
 * profile, another site) is refused, so the page can only ever send visitors to an invitation.
 */
const INVITE = /^(?:https?:\/\/)?(discord\.gg|(?:www\.)?discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,64})\/?$/i;

export function parseDiscordInvite(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: null };
  const m = INVITE.exec(text);
  if (!m) return { ok: false, error: "Paste the server's invitation link: discord.gg/… or discord.com/invite/…" };
  const host = m[1]!.toLowerCase().startsWith("discord.gg") ? "discord.gg" : "discord.com/invite";
  return { ok: true, value: `https://${host}/${m[2]}` };
}

/** Text as stored: trimmed, inner runs of spaces kept, cut to its limit. */
function text(v: unknown, fallback: string, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

/** A label: never empty (a button must say something). */
function label(v: unknown, fallback: string, max: number): string {
  return (typeof v === "string" && v.trim() ? v.trim() : fallback).slice(0, max);
}

/** Parses stored settings: unknown keys are dropped, missing ones take their defaults, and a stored invitation that is not one reads as none. */
export function parsePublicSite(raw: unknown): PublicSite {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PUBLIC_SITE;
  const invite = typeof r.discordUrl === "string" ? parseDiscordInvite(r.discordUrl) : null;
  return {
    heroTitle: text(r.heroTitle, d.heroTitle, PUBLIC_SITE_LIMITS.heroTitle),
    heroText: text(r.heroText, d.heroText, PUBLIC_SITE_LIMITS.heroText),
    teamLabel: label(r.teamLabel, d.teamLabel, PUBLIC_SITE_LIMITS.teamLabel),
    communityLabel: label(r.communityLabel, d.communityLabel, PUBLIC_SITE_LIMITS.communityLabel),
    discordUrl: invite?.ok ? invite.value : null,
    communityText: text(r.communityText, d.communityText, PUBLIC_SITE_LIMITS.communityText),
    playingOpen: typeof r.playingOpen === "boolean" ? r.playingOpen : d.playingOpen,
    playingText: text(r.playingText, d.playingText, PUBLIC_SITE_LIMITS.playingText),
    signOff: text(r.signOff, d.signOff, PUBLIC_SITE_LIMITS.signOff),
  };
}

/**
 * An admin's input, checked: the invitation must be one (an error says how), texts are cut to
 * their limits. Returns what is stored.
 */
export function validatePublicSite(input: Partial<Record<keyof PublicSite, unknown>>): { ok: true; value: PublicSite } | { ok: false; error: string } {
  const invite = parseDiscordInvite(typeof input.discordUrl === "string" ? input.discordUrl : "");
  if (!invite.ok) return invite;
  return { ok: true, value: parsePublicSite({ ...input, discordUrl: invite.value ?? "" }) };
}
