/*
  A resource as the pages show it: its sections and icons, what its address may be, and the order
  and search the pages use. The pages use this in the browser, so it holds no validation library:
  reading the stored library and checking what an administrator types in happen on the server
  (domain/resources.ts, which re-exports everything here).
*/

/**
 * The sections, in the order the pages show them. The last four are no longer offered (21 Oct
 * 2026: their defaults left the library). They stay readable, so an entry an administrator kept or
 * added in one of them still shows under its section until it is moved.
 */
export const RESOURCE_SECTIONS = [
  { key: "league", label: "League of Legends", offered: true },
  { key: "sr", label: "Summoner's Rift", offered: true },
  { key: "aram", label: "ARAM", offered: true },
  { key: "arena", label: "Arena", offered: true },
  { key: "esports", label: "Esports", offered: true },
  { key: "rotating", label: "Rotating modes", offered: false },
  { key: "classic", label: "League Classic", offered: false },
  { key: "tft", label: "Teamfight Tactics", offered: false },
  { key: "learning", label: "Learning", offered: false },
] as const;

export type ResourceSection = (typeof RESOURCE_SECTIONS)[number]["key"];
export const SECTION_KEYS = RESOURCE_SECTIONS.map((s) => s.key) as [ResourceSection, ...ResourceSection[]];

export function sectionLabel(key: ResourceSection): string {
  return RESOURCE_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

/** A section a new or moved entry may go to. */
export function sectionOffered(key: ResourceSection): boolean {
  return RESOURCE_SECTIONS.find((s) => s.key === key)?.offered === true;
}

/** How an entry is drawn: the site's own icon (its favicon), or one of these. */
export const RESOURCE_ICONS = ["favicon", "globe", "news", "stats", "book", "trophy", "learn", "swords", "tool", "video"] as const;
export type ResourceIcon = (typeof RESOURCE_ICONS)[number];

export const RESOURCE_ICON_LABELS: Record<ResourceIcon, string> = {
  favicon: "The site's own icon",
  globe: "Globe",
  news: "News",
  stats: "Statistics",
  book: "Book",
  trophy: "Trophy",
  learn: "Learning",
  swords: "Swords",
  tool: "Tool",
  video: "Video",
};

export interface Resource {
  /** Stable: "d-…" for a default (never reused for another site), "c-…" for one an administrator added. */
  id: string;
  title: string;
  url: string;
  description: string;
  section: ResourceSection;
  icon: ResourceIcon;
  /** Kept in the library but not shown to members. */
  hidden: boolean;
}

export const RESOURCE_LIMITS = { title: 60, description: 160, url: 300, entries: 200 } as const;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * An address a resource may link to, normalised; or why not. Only https, on a public host name (no
 * IP address, no localhost or local name, no port, no user name or password in it), at most 300
 * characters. Anything else (javascript:, data:, http:, a file) is refused.
 */
export function checkResourceUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Enter the address." };
  if (text.length > RESOURCE_LIMITS.url) return { ok: false, error: `Keep the address under ${RESOURCE_LIMITS.url} characters.` };
  if (/\s/.test(text)) return { ok: false, error: "An address has no spaces." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { ok: false, error: "That is not a web address." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Only https:// addresses can be added." };
  if (url.username || url.password) return { ok: false, error: "An address with a user name or password cannot be added." };
  if (url.port) return { ok: false, error: "An address with a port number cannot be added." };
  const host = url.hostname.toLowerCase();
  if (host.startsWith("[") || IPV4.test(host)) return { ok: false, error: "Use the site's name, not an IP address." };
  if (!host.includes(".") || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return { ok: false, error: "Use a public site's address." };
  const normalised = url.toString();
  if (normalised.length > RESOURCE_LIMITS.url) return { ok: false, error: `Keep the address under ${RESOURCE_LIMITS.url} characters.` };
  return { ok: true, url: normalised };
}

/** The host a link goes to, as shown beside its title ("op.gg", "wiki.leagueoflegends.com"). */
export function resourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Where the site's own icon is: its favicon, loaded by the browser from the site itself. */
export function faviconUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? `https://${u.hostname}/favicon.ico` : null;
  } catch {
    return null;
  }
}

export function orderedBySection(entries: readonly Resource[]): Resource[] {
  const rank = new Map(SECTION_KEYS.map((k, i) => [k, i]));
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank.get(a.e.section)! - rank.get(b.e.section)! || a.i - b.i)
    .map((x) => x.e);
}

const fold = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/** Entries whose title, description, address or section match every word of the query (accents and case ignored). */
export function searchResources(entries: readonly Resource[], query: string): Resource[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...entries];
  return entries.filter((e) => {
    const text = fold(`${e.title} ${e.description} ${resourceHost(e.url)} ${sectionLabel(e.section)}`);
    return words.every((w) => text.includes(w));
  });
}
