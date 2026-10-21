import { z } from "zod";

/*
  RESOURCES: the team's library of League of Legends sites (Player Mode → Resources), kept by
  administrators (Admin Mode → Platform Settings → Resources).

  Storage: one small document in app_settings ("resources"), not a table of its own: a few dozen
  short entries, read on one page (cached per server instance) and written only by administrators.
  Until an administrator changes something nothing is stored, and the library is the defaults below.

  Defaults are never recreated. The document remembers every default it has included (`seen`): a
  default an administrator removed stays removed (it can be restored on request), a hidden one stays
  hidden and an edited one keeps its edits, whatever a later release changes in this file. Only a
  default added in a later release, which the library has never seen, joins it by itself, at the
  end of its section.

  Everything is plain text: titles and descriptions are shown as text, never as HTML, and a link is
  only ever an https address on a public host name (checkResourceUrl).
*/

export const RESOURCE_SECTIONS = [
  { key: "league", label: "League of Legends" },
  { key: "sr", label: "Summoner's Rift" },
  { key: "aram", label: "ARAM" },
  { key: "arena", label: "Arena" },
  { key: "rotating", label: "Rotating modes" },
  { key: "classic", label: "League Classic" },
  { key: "tft", label: "Teamfight Tactics" },
  { key: "esports", label: "Esports" },
  { key: "learning", label: "Learning" },
] as const;

export type ResourceSection = (typeof RESOURCE_SECTIONS)[number]["key"];
const SECTION_KEYS = RESOURCE_SECTIONS.map((s) => s.key) as [ResourceSection, ...ResourceSection[]];

export function sectionLabel(key: ResourceSection): string {
  return RESOURCE_SECTIONS.find((s) => s.key === key)?.label ?? key;
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

export interface ResourceLibrary {
  /** In display order: sections in RESOURCE_SECTIONS order, entries in this order within each. */
  entries: Resource[];
  /** Every default id the library has ever included. */
  seen: string[];
}

export const RESOURCE_LIMITS = { title: 60, description: 160, url: 300, entries: 200 } as const;

type DefaultResource = Omit<Resource, "hidden" | "icon"> & { icon?: ResourceIcon };

/**
 * The starting library: each address checked on 21 Oct 2026 (it exists and is current). Ids are
 * permanent: a default removed from this list later stays wherever libraries already have it, and
 * a new default needs a new id.
 */
export const DEFAULT_RESOURCES: readonly DefaultResource[] = [
  { id: "d-lol-news", section: "league", title: "League of Legends news", url: "https://www.leagueoflegends.com/en-us/news/", description: "Riot's official news: dev updates, events and announcements." },
  { id: "d-patch-notes", section: "league", title: "Patch notes", url: "https://www.leagueoflegends.com/en-us/news/tags/patch-notes/", description: "Every patch's official notes: champion, item and system changes." },
  { id: "d-lol-wiki", section: "league", title: "League of Legends Wiki", url: "https://wiki.leagueoflegends.com/en-us/", description: "Champions, items, runes and modes in detail, kept current by the community." },
  { id: "d-opgg", section: "sr", title: "OP.GG", url: "https://op.gg/", description: "Player search, champion builds and ranked tier lists." },
  { id: "d-lolalytics", section: "sr", title: "LoLalytics", url: "https://lolalytics.com/", description: "Win rates, builds and matchups by rank and patch, from millions of games." },
  { id: "d-pros-lol", section: "sr", title: "pros.lol", url: "https://pros.lol/", description: "What pro players build: items, runes and skill orders, updated every 15 minutes." },
  { id: "d-opgg-aram", section: "aram", title: "OP.GG ARAM", url: "https://op.gg/lol/modes/aram", description: "ARAM tier list, with builds for each champion." },
  { id: "d-lolalytics-aram", section: "aram", title: "LoLalytics ARAM", url: "https://lolalytics.com/lol/tierlist/aram/", description: "ARAM tier list by win rate and pick rate." },
  { id: "d-opgg-arena", section: "arena", title: "OP.GG Arena", url: "https://op.gg/lol/modes/arena", description: "Arena tier list, with builds and duo synergies." },
  { id: "d-lolalytics-arena", section: "arena", title: "LoLalytics Arena", url: "https://lolalytics.com/lol/tierlist/arena/", description: "Arena tier list by win rate." },
  { id: "d-opgg-aram-mayhem", section: "rotating", title: "OP.GG ARAM: Mayhem", url: "https://op.gg/lol/modes/aram-mayhem", description: "Tier list for ARAM: Mayhem, the version of ARAM with augments." },
  { id: "d-featured-modes", section: "rotating", title: "Featured game modes", url: "https://wiki.leagueoflegends.com/en-us/Featured_game_mode", description: "Every featured mode, current and past, and how each one plays." },
  { id: "d-classic-dev", section: "classic", title: "/dev: League Classic", url: "https://www.leagueoflegends.com/en-us/news/dev/dev-league-classic/", description: "Riot on what League Classic is and how it plays." },
  { id: "d-classic-wiki", section: "classic", title: "League Classic on the wiki", url: "https://wiki.leagueoflegends.com/en-us/League_Classic", description: "Its champions, rules and items, and how they differ from today's League." },
  { id: "d-tactics-tools", section: "tft", title: "tactics.tools", url: "https://tactics.tools/", description: "TFT comps, units and items with their statistics, and match histories." },
  { id: "d-metatft", section: "tft", title: "MetaTFT", url: "https://www.metatft.com/", description: "TFT comps, tier lists and stats, updated every few minutes." },
  { id: "d-tft-news", section: "tft", title: "Teamfight Tactics news", url: "https://teamfighttactics.leagueoflegends.com/en-us/news/", description: "Riot's official TFT news and patch notes." },
  { id: "d-lolesports", section: "esports", title: "LoL Esports", url: "https://lolesports.com/", description: "Riot's esports site: schedules, live matches, standings and VODs." },
  { id: "d-esports-news", section: "esports", title: "Esports news", url: "https://www.leagueoflegends.com/en-us/news/esports/", description: "Esports announcements on the official League site." },
  { id: "d-how-to-play", section: "learning", title: "How to play", url: "https://www.leagueoflegends.com/en-us/how-to-play/", description: "Riot's introduction: lanes, objectives, champions and controls." },
  { id: "d-champions", section: "learning", title: "Champions", url: "https://www.leagueoflegends.com/en-us/champions/", description: "Every champion's abilities, explained by Riot, with videos." },
];

const asResource = (d: DefaultResource): Resource => ({ ...d, icon: d.icon ?? "favicon", hidden: false });

/** Thrown for input an administrator can correct: the message says what is wrong. */
export class ResourceInputError extends Error {}

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

/** Text as it is stored: no control characters, single spaces, trimmed, at most `max` characters. */
export function plainText(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const sectionSchema = z.enum(SECTION_KEYS);
const iconSchema = z.enum(RESOURCE_ICONS);

/** What an administrator enters for a resource (new or edited). */
export const resourceInputSchema = z.object({
  title: z.string().max(200),
  url: z.string().max(1000),
  description: z.string().max(1000).default(""),
  section: sectionSchema,
  icon: iconSchema.default("favicon"),
});
export type ResourceInput = z.input<typeof resourceInputSchema>;

/** A checked entry's fields from an administrator's input, or a ResourceInputError saying what to fix. */
export function cleanResourceInput(input: unknown): Omit<Resource, "id" | "hidden"> {
  const parsed = resourceInputSchema.safeParse(input);
  if (!parsed.success) throw new ResourceInputError("Something in this resource is not valid.");
  const title = plainText(parsed.data.title, RESOURCE_LIMITS.title + 1);
  if (!title) throw new ResourceInputError("Give it a title.");
  if (title.length > RESOURCE_LIMITS.title) throw new ResourceInputError(`Keep the title to ${RESOURCE_LIMITS.title} characters.`);
  const description = plainText(parsed.data.description, RESOURCE_LIMITS.description + 1);
  if (description.length > RESOURCE_LIMITS.description) throw new ResourceInputError(`Keep the description to ${RESOURCE_LIMITS.description} characters.`);
  const url = checkResourceUrl(parsed.data.url);
  if (!url.ok) throw new ResourceInputError(url.error);
  return { title, url: url.url, description, section: parsed.data.section, icon: parsed.data.icon };
}

const storedEntrySchema = z.object({
  id: z.string().regex(/^[dc]-[a-z0-9-]{1,40}$/),
  title: z.string().min(1).max(RESOURCE_LIMITS.title),
  url: z.string().max(RESOURCE_LIMITS.url),
  description: z.string().max(RESOURCE_LIMITS.description),
  section: sectionSchema,
  icon: iconSchema,
  hidden: z.boolean(),
});

/**
 * The library from what is stored (null when nothing is), with any default it has never seen
 * added at the end of its section. A stored entry that no longer reads (an unknown section, an
 * address that is no longer allowed) is left out rather than replaced by a default.
 */
export function libraryFrom(stored: unknown, defaults: readonly DefaultResource[] = DEFAULT_RESOURCES): ResourceLibrary {
  if (stored === null || stored === undefined) return { entries: defaults.map(asResource), seen: defaults.map((d) => d.id) };
  const doc = typeof stored === "object" ? (stored as { entries?: unknown; seen?: unknown }) : {};
  const ids = new Set<string>();
  const entries: Resource[] = [];
  for (const raw of Array.isArray(doc.entries) ? doc.entries : []) {
    const e = storedEntrySchema.safeParse(raw);
    if (!e.success || ids.has(e.data.id) || !checkResourceUrl(e.data.url).ok || entries.length >= RESOURCE_LIMITS.entries) continue;
    ids.add(e.data.id);
    entries.push(e.data);
  }
  const seen = new Set<string>(Array.isArray(doc.seen) ? doc.seen.filter((s): s is string => typeof s === "string") : []);
  // Defaults present before `seen` existed count as seen.
  for (const e of entries) if (e.id.startsWith("d-")) seen.add(e.id);
  for (const d of defaults) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    entries.splice(insertionIndex(entries, d.section), 0, asResource(d));
  }
  return { entries, seen: [...seen] };
}

/** Where an entry joining a section goes: after that section's last entry (else at the end). */
function insertionIndex(entries: readonly Resource[], section: ResourceSection): number {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i]!.section === section) return i + 1;
  return entries.length;
}

/** Defaults the library once had that an administrator removed (restorable). */
export function removedDefaults(lib: ResourceLibrary, defaults: readonly DefaultResource[] = DEFAULT_RESOURCES): Resource[] {
  const present = new Set(lib.entries.map((e) => e.id));
  const seen = new Set(lib.seen);
  return defaults.filter((d) => seen.has(d.id) && !present.has(d.id)).map(asResource);
}

const find = (lib: ResourceLibrary, id: string) => {
  const i = lib.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new ResourceInputError("That resource is no longer in the library: reload the page.");
  return i;
};

/** Adds an entry at the end of its section. */
export function addResource(lib: ResourceLibrary, fields: Omit<Resource, "id" | "hidden">, id: string): ResourceLibrary {
  if (lib.entries.length >= RESOURCE_LIMITS.entries) throw new ResourceInputError(`The library holds at most ${RESOURCE_LIMITS.entries} resources.`);
  if (lib.entries.some((e) => e.url === fields.url)) throw new ResourceInputError("That address is already in the library.");
  const entries = [...lib.entries];
  entries.splice(insertionIndex(entries, fields.section), 0, { ...fields, id, hidden: false });
  return { ...lib, entries };
}

/** Changes an entry's title, address, description, section or icon (a new section puts it at that section's end). */
export function updateResource(lib: ResourceLibrary, id: string, fields: Omit<Resource, "id" | "hidden">): ResourceLibrary {
  const i = find(lib, id);
  if (lib.entries.some((e) => e.id !== id && e.url === fields.url)) throw new ResourceInputError("That address is already in the library.");
  const current = lib.entries[i]!;
  const updated = { ...current, ...fields };
  if (current.section === fields.section) return { ...lib, entries: lib.entries.map((e, j) => (j === i ? updated : e)) };
  const entries = lib.entries.filter((_, j) => j !== i);
  entries.splice(insertionIndex(entries, fields.section), 0, updated);
  return { ...lib, entries };
}

/** Hides an entry from members (kept in the library), or shows it again. */
export function setResourceHidden(lib: ResourceLibrary, id: string, hidden: boolean): ResourceLibrary {
  const i = find(lib, id);
  return { ...lib, entries: lib.entries.map((e, j) => (j === i ? { ...e, hidden } : e)) };
}

/** Moves an entry one place up or down within its section. */
export function moveResource(lib: ResourceLibrary, id: string, direction: "up" | "down"): ResourceLibrary {
  const i = find(lib, id);
  const section = lib.entries[i]!.section;
  const step = direction === "up" ? -1 : 1;
  let j = i + step;
  while (j >= 0 && j < lib.entries.length && lib.entries[j]!.section !== section) j += step;
  if (j < 0 || j >= lib.entries.length) return lib;
  const entries = [...lib.entries];
  [entries[i], entries[j]] = [entries[j]!, entries[i]!];
  return { ...lib, entries };
}

/** Removes an entry. A default stays known (seen), so it never comes back by itself. */
export function removeResource(lib: ResourceLibrary, id: string): ResourceLibrary {
  const i = find(lib, id);
  return { ...lib, entries: lib.entries.filter((_, j) => j !== i) };
}

/** Puts removed defaults back (all of them, or those listed), as they were first published, at the end of their sections. */
export function restoreDefaults(lib: ResourceLibrary, ids: readonly string[] | null = null, defaults: readonly DefaultResource[] = DEFAULT_RESOURCES): ResourceLibrary {
  const wanted = removedDefaults(lib, defaults).filter((d) => !ids || ids.includes(d.id));
  let entries = [...lib.entries];
  for (const d of wanted) {
    if (entries.some((e) => e.url === d.url)) continue;
    entries.splice(insertionIndex(entries, d.section), 0, d);
  }
  if (entries.length > RESOURCE_LIMITS.entries) entries = entries.slice(0, RESOURCE_LIMITS.entries);
  return { ...lib, entries };
}

/** The entries members see, in display order (sections in their fixed order, then the library's order). */
export function visibleResources(lib: ResourceLibrary): Resource[] {
  return orderedBySection(lib.entries.filter((e) => !e.hidden));
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
