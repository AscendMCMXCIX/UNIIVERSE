/*
  A member's optional YouTube, Twitch and Discord, on their profile. Each link has one switch,
  "Show publicly", off until its owner turns it on: on, the link shows to signed-in team members
  (their profile, Team card, the Players directory) and on the public team page alike; off, nobody
  sees it but its owner, in Settings. An icon is shown only for a link switched on whose value still
  passes the checks below: a stored value alone never shows anything.

  Until November 2026 a link had one of three audiences ("hidden", "team", "public"). Migration
  0061 (drizzle/0061_social_links_public.sql) turned "public" into on and the other two into off,
  so no link became visible to anyone who could not see it before (a team-only link is now hidden
  from the team too). isShownPublicly applies the same rule to a row still in the old shape (written
  by the previous version while a deployment changed over) and to a save from a page loaded before.

  Nothing is fetched from these services, nothing is embedded and no account is connected: YouTube
  and Twitch are plain links to the channel. Discord is either a username to copy (Discord has no
  public address for a username) or the address of the member's Discord profile (discord.com/users/
  and the account's number), which opens in Discord. Only these sites' own addresses are accepted,
  so a link can never lead anywhere else.
*/

export const SOCIAL_KINDS = ["youtube", "twitch", "discord"] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

export interface SocialLink {
  /** The normalised value: a channel address for YouTube and Twitch, a username for Discord. */
  value: string;
  /** "Show publicly": shown to team members and on the public team page. Off (the default): only its owner sees it, in Settings. */
  public: boolean;
}
export type SocialLinks = Partial<Record<SocialKind, SocialLink>>;

export const SOCIAL_LABELS: Readonly<Record<SocialKind, string>> = { youtube: "YouTube", twitch: "Twitch", discord: "Discord" };

/**
 * Whether a stored or submitted link is switched on: only an explicit true, or the old "public"
 * audience (see the note at the top). Anything else (missing, false, the old "team" or "hidden"
 * audiences, nonsense) is off: a link is never shown more widely than its owner chose.
 */
export function isShownPublicly(item: unknown): boolean {
  if (!item || typeof item !== "object") return false;
  const o = item as { public?: unknown; show?: unknown };
  return o.public === true || o.show === "public";
}

/** Links as stored (the column is JSON), in the current shape: each kind with a text value and its switch; anything malformed is dropped. */
export function readSocialLinks(raw: unknown): SocialLinks | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const links: SocialLinks = {};
  for (const kind of SOCIAL_KINDS) {
    const item = (raw as Record<string, unknown>)[kind];
    if (!item || typeof item !== "object") continue;
    const value = (item as { value?: unknown }).value;
    if (typeof value !== "string" || !value) continue;
    links[kind] = { value, public: isShownPublicly(item) };
  }
  return Object.keys(links).length ? links : null;
}

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
}

function textOf(kind: SocialKind, value: string): string {
  if (kind === "discord") return DISCORD_PROFILE.test(value) ? "Discord profile" : `@${value}`;
  const path = decodeURIComponent(new URL(value).pathname).replace(/^\/+/, "");
  return kind === "twitch" ? path : path.startsWith("@") ? path : "YouTube channel";
}

/**
 * The links anyone but their owner may see (team members and the public page alike), in a fixed
 * order: only those switched on (strictly true), and only values that still pass the checks (a
 * changed rule or a hand-edited row hides a link rather than showing it).
 */
export function visibleSocialLinks(links: SocialLinks | null | undefined): SocialLinkView[] {
  if (!links || typeof links !== "object") return [];
  const out: SocialLinkView[] = [];
  for (const kind of SOCIAL_KINDS) {
    const link = links[kind];
    if (!link || typeof link.value !== "string" || link.public !== true) continue;
    const checked = checkSocialValue(kind, link.value);
    if (!checked.ok || checked.value === null || checked.value !== link.value) continue;
    out.push({ kind, label: SOCIAL_LABELS[kind], text: textOf(kind, link.value), href: kind !== "discord" || DISCORD_PROFILE.test(link.value) ? link.value : null });
  }
  return out;
}

/** Input from the Settings form (a value and "Show publicly" per service), checked and normalised as a whole; the first problem is reported by service. */
export function normaliseSocialLinks(input: Partial<Record<SocialKind, { value?: unknown; public?: unknown; show?: unknown }>>): { ok: true; links: SocialLinks | null } | { ok: false; kind: SocialKind; error: string } {
  const links: SocialLinks = {};
  for (const kind of SOCIAL_KINDS) {
    const item = input[kind];
    if (!item) continue;
    const checked = checkSocialValue(kind, typeof item.value === "string" ? item.value : "");
    if (!checked.ok) return { ok: false, kind, error: checked.error };
    if (checked.value !== null) links[kind] = { value: checked.value, public: isShownPublicly(item) };
  }
  return { ok: true, links: Object.keys(links).length ? links : null };
}
