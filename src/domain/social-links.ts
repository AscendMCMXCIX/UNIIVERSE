/*
  A member's optional YouTube, Twitch and Discord, on their profile. Each is off until they choose
  who may see it: "hidden" (only them, in Settings), "team" (signed-in members: their profile and
  Team card) or "public" (also the public team page). An icon is shown only for a link its owner
  chose to show to that audience and that still passes the checks below: a stored value alone
  never shows anything.

  Nothing is fetched from these services, nothing is embedded and no account is connected: YouTube
  and Twitch are plain links to the channel. Discord is either a username to copy (Discord has no
  public address for a username) or the address of the member's Discord profile (discord.com/users/
  and the account's number), which opens in Discord. Only these sites' own addresses are accepted,
  so a link can never lead anywhere else.
*/

export const SOCIAL_KINDS = ["youtube", "twitch", "discord"] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

export const SOCIAL_AUDIENCES = ["hidden", "team", "public"] as const;
export type SocialAudience = (typeof SOCIAL_AUDIENCES)[number];

export interface SocialLink {
  /** The normalised value: a channel address for YouTube and Twitch, a username for Discord. */
  value: string;
  show: SocialAudience;
}
export type SocialLinks = Partial<Record<SocialKind, SocialLink>>;

export const SOCIAL_LABELS: Readonly<Record<SocialKind, string>> = { youtube: "YouTube", twitch: "Twitch", discord: "Discord" };
export const AUDIENCE_LABELS: Readonly<Record<SocialAudience, string>> = { hidden: "Only me", team: "Team members", public: "Team members and the public page" };

type Checked = { ok: true; value: string } | { ok: false; error: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

/** A pasted address, with or without https:// (never another scheme), on one of `hosts`; null otherwise. */
function addressOn(raw: string, hosts: ReadonlySet<string>): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  return hosts.has(url.hostname.toLowerCase()) ? url : null;
}

/** A YouTube handle: 3–30 letters (any script), digits, ".", "_" or "-". */
const HANDLE = /^@([\p{L}\p{N}._-]{3,30})$/u;

/** "@handle", "youtube.com/@handle", ".../channel/UC…", ".../c/name", ".../user/name": the channel's address, or why not. */
function checkYoutube(raw: string): Checked {
  const handle = HANDLE.exec(raw.normalize("NFC"));
  if (handle) return { ok: true, value: `https://www.youtube.com/@${handle[1]}` };
  const url = addressOn(raw, YOUTUBE_HOSTS);
  if (!url) return { ok: false, error: "Enter your channel's address on youtube.com (for example youtube.com/@yourname) or your @handle." };
  let path: string;
  try {
    path = decodeURIComponent(url.pathname).normalize("NFC").replace(/\/+$/, "");
  } catch {
    return { ok: false, error: "That is not a channel address. Use youtube.com/@yourname or youtube.com/channel/…" };
  }
  const at = HANDLE.exec(path.slice(1));
  if (path.startsWith("/@") && at) return { ok: true, value: `https://www.youtube.com/@${at[1]}` };
  const channel = /^\/channel\/(UC[A-Za-z0-9_-]{22})$/.exec(path);
  if (channel) return { ok: true, value: `https://www.youtube.com/channel/${channel[1]}` };
  const legacy = /^\/(c|user)\/([A-Za-z0-9_-]{1,100})$/.exec(path);
  if (legacy) return { ok: true, value: `https://www.youtube.com/${legacy[1]}/${legacy[2]}` };
  return { ok: false, error: "That is not a channel address. Use youtube.com/@yourname or youtube.com/channel/…" };
}

/** "name", "twitch.tv/name": the channel's address, or why not. Twitch names are 4–25 letters, digits or underscores. */
function checkTwitch(raw: string): Checked {
  let login = raw;
  if (raw.includes("/") || raw.includes(".")) {
    const url = addressOn(raw, TWITCH_HOSTS);
    if (!url) return { ok: false, error: "Enter your channel's address on twitch.tv (for example twitch.tv/yourname) or your Twitch name." };
    login = url.pathname.replace(/^\/+|\/+$/g, "");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_]{3,24}$/.test(login)) return { ok: false, error: "Twitch names are 4 to 25 letters, digits or underscores." };
  return { ok: true, value: `https://www.twitch.tv/${login.toLowerCase()}` };
}

const DISCORD_HOSTS = new Set(["discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"]);
/** Where a Discord profile opens: discord.com/users/ and the account's number (17 to 20 digits). */
const DISCORD_PROFILE = /^https:\/\/discord\.com\/users\/\d{17,20}$/;

/**
 * A Discord username (2–32 lower-case letters, digits, "_" or "."; no ".."), with or without "@";
 * or a Discord profile: its address (discord.com/users/…) or the account's number alone.
 */
function checkDiscord(raw: string): Checked {
  const profile = /^\d{17,20}$/.test(raw) ? raw : raw.includes("/") ? /^\/users\/(\d{17,20})\/?$/.exec(addressOn(raw, DISCORD_HOSTS)?.pathname ?? "")?.[1] : null;
  if (profile) return { ok: true, value: `https://discord.com/users/${profile}` };
  if (raw.includes("/")) return { ok: false, error: "Enter your Discord username, or your profile's address: discord.com/users/ and your account's number." };
  const name = raw.replace(/^@/, "").toLowerCase();
  if (raw.includes("#")) return { ok: false, error: "Enter your Discord username (Discord no longer uses the #1234 numbers)." };
  if (!/^[a-z0-9_.]{2,32}$/.test(name) || name.includes("..")) return { ok: false, error: "Discord usernames are 2 to 32 lower-case letters, digits, underscores or full stops." };
  return { ok: true, value: name };
}

/** A typed value for one service, normalised; an empty value clears it. */
export function checkSocialValue(kind: SocialKind, input: string): Checked | { ok: true; value: null } {
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > 200) return { ok: false, error: "That is too long." };
  return kind === "youtube" ? checkYoutube(raw) : kind === "twitch" ? checkTwitch(raw) : checkDiscord(raw);
}

/** What the page shows for one link. `href` is null for a Discord username (it is copied instead). */
export interface SocialLinkView {
  kind: SocialKind;
  label: string;
  /** "@name" for YouTube handles and Discord, the channel name for Twitch, the address otherwise. */
  text: string;
  href: string | null;
  /** Chosen for the public page too (the public boundary keeps only these). */
  public: boolean;
}

function textOf(kind: SocialKind, value: string): string {
  if (kind === "discord") return DISCORD_PROFILE.test(value) ? "Discord profile" : `@${value}`;
  const path = decodeURIComponent(new URL(value).pathname).replace(/^\/+/, "");
  return kind === "twitch" ? path : path.startsWith("@") ? path : "YouTube channel";
}

/**
 * The links `audience` may see, in a fixed order: only those their owner chose for it ("team" sees
 * team and public links, "public" only public ones), and only values that still pass the checks
 * (a changed rule or a hand-edited row hides a link rather than showing it).
 */
export function visibleSocialLinks(links: SocialLinks | null | undefined, audience: "team" | "public"): SocialLinkView[] {
  if (!links || typeof links !== "object") return [];
  const out: SocialLinkView[] = [];
  for (const kind of SOCIAL_KINDS) {
    const link = links[kind];
    if (!link || typeof link.value !== "string") continue;
    if (!(link.show === "public" || (audience === "team" && link.show === "team"))) continue;
    const checked = checkSocialValue(kind, link.value);
    if (!checked.ok || checked.value === null || checked.value !== link.value) continue;
    out.push({ kind, label: SOCIAL_LABELS[kind], text: textOf(kind, link.value), href: kind !== "discord" || DISCORD_PROFILE.test(link.value) ? link.value : null, public: link.show === "public" });
  }
  return out;
}

/** Input from the Settings form, checked and normalised as a whole; the first problem is reported by service. */
export function normaliseSocialLinks(input: Partial<Record<SocialKind, { value?: unknown; show?: unknown }>>): { ok: true; links: SocialLinks | null } | { ok: false; kind: SocialKind; error: string } {
  const links: SocialLinks = {};
  for (const kind of SOCIAL_KINDS) {
    const item = input[kind];
    if (!item) continue;
    const show = SOCIAL_AUDIENCES.includes(item.show as SocialAudience) ? (item.show as SocialAudience) : "hidden";
    const checked = checkSocialValue(kind, typeof item.value === "string" ? item.value : "");
    if (!checked.ok) return { ok: false, kind, error: checked.error };
    if (checked.value !== null) links[kind] = { value: checked.value, show };
  }
  return { ok: true, links: Object.keys(links).length ? links : null };
}
