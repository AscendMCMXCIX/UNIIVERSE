import type { Db } from "@/server/db/types";
import { FACT_TAGS, SLOTS, type AbilityRef, type AbilityView, type BriefingPoint, type BriefingPointView, type ChampionChoice, type ChampionIntelView, type ChampionNotes, type DdragonChampionAbilities, type Fact, type FactSubject, type FactTag, type FactView, type Freshness, type InteractionView, type MatchupIntelView, type MatchupNotes, type MatchupPageView, type Recheck, type Slot, type Source, type SourceLinkView } from "@/domain/matchup-intel/types";
import { abilityChanges, abilityFreshness, compareDdragonVersions, cooldownDisplay, curatedCooldownDisplay, modifiersView, weakestFreshness } from "@/domain/matchup-intel/cooldown";
import { patchFromVersion, patchesAfter, publicPatchName } from "@/domain/patch";
import { keepUnitsWithNumbers } from "@/lib/format";
import { cachedFor } from "@/server/observability/cache";
import { getCurrentPatch, listChampions, listPatchesDesc, type ChampionSummary } from "@/server/repositories/champions";
import { loadChampionAbilities } from "./abilities";
import { curatedEnemiesFor, getChampionNotes, getMatchupNotes } from "./curated";

/*
  MATCHUP INTEL's page, built on the server (docs/MATCHUP_INTEL.md): the two champions chosen in the
  address, checked against the roster, each with its abilities from Data Dragon and the curated
  notes that exist, and the curated matchup for this direction only. Plain data goes to the browser
  (MatchupPageView); the curated dataset and these modules never do (src/app/client-imports.test.ts).

  The work is what the page needs and no more: the session (the page's own check), the cached
  roster, current patch and list of patches, and the stored abilities of the one or two champions
  chosen. The curated notes are committed with the code, so reading them costs no request.
*/

/**
 * The most patches curated notes may go unchecked (docs/MATCHUP_INTEL.md, "Freshness"): past this
 * many patches since its check, a briefing is hidden, and champion notes are flagged as possibly
 * out of date, until a person checks them again. Until then each says it has not been re-checked
 * for the newest patch. Riot's data cannot show most changes (a crowd-control duration, a range sit
 * behind its tooltips' placeholders), so a check's age is the only sign of them.
 */
export const MAX_PATCHES_UNCHECKED = 2;

/** What the view is built from, injected so it is tested without a database. */
export interface MatchupViewDeps {
  /** Every active champion (the cached roster). */
  champions: readonly ChampionChoice[];
  /** The current patch as stored ("16.22", Data Dragon "16.22.1"); null when none is known yet, or it is the offline fixture. */
  currentPatch: { patch: string; ddragonVersion: string } | null;
  /**
   * The stored Data Dragon abilities of these champions (null for one with none stored yet, or one
   * whose record cannot be read, which `unreadable` names), and which of them are the committed
   * offline copy (`offline`).
   */
  loadAbilities: (championIds: readonly string[]) => Promise<{ version: string | null; champions: Record<string, DdragonChampionAbilities | null>; offline?: readonly string[]; unreadable?: readonly string[] }>;
  /** The patches the app has seen ("16.22"), newest first, to count how many came after a check; [] or absent when none are known. */
  knownPatches?: readonly string[];
  championNotes: (championId: string) => ChampionNotes | null;
  /** The curated matchup for your champion against the enemy, this direction only. */
  matchupNotes: (championId: string, vsId: string) => MatchupNotes | null;
}

/** The hosts a curated source may link to: the League of Legends Wiki and Riot's own. */
const SOURCE_HOSTS = new Set(["wiki.leagueoflegends.com", "ddragon.leagueoflegends.com", "developer.riotgames.com"]);

/** A source's address when it is an https link to one of SOURCE_HOSTS; null otherwise (the link is dropped, the title kept). */
export function safeSourceUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !SOURCE_HOSTS.has(u.hostname) || u.username || u.password || u.port) return null;
  return u.toString();
}

/** A Data Dragon version as stored ("16.22.1"). */
const VERSION = /^\d{1,3}(\.\d{1,4}){1,3}$/;

/** A Data Dragon image file name ("RivenTriCleave.png", "Renekton_Predator.png"). */
const ICON_FILE = /^[\w.\- ]{1,100}\.(png|jpe?g|webp)$/i;

/** An ability's icon on Data Dragon: /img/passive/ for the passive, /img/spell/ for the others; null when the version or the file name is not one. */
export function abilityIconUrl(version: string | null, slot: Slot, icon: string): string | null {
  if (!version || !VERSION.test(version) || !ICON_FILE.test(icon)) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/${slot === "P" ? "passive" : "spell"}/${encodeURIComponent(icon)}`;
}

/** "26.22" for Data Dragon "16.22.1": the public patch a version belongs to. */
function publicPatchOf(version: string | null): string | null {
  const patch = version ? patchFromVersion(version) : null;
  return patch ? publicPatchName(patch) : null;
}

/** A search key: case, accents, spaces and punctuation ignored ("Kha'Zix" = "khazix"). */
const looseKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** The longest id or name the address may carry; anything longer is not a champion. */
const MAX_PARAM = 64;

/**
 * The champion an address names, from the roster only: its id exactly, else its id or name with
 * case, accents and punctuation ignored ("riven", "Wukong" for MonkeyKing). Anything else is
 * dropped, so only the roster's own ids ever reach a link or an attribute.
 */
export function championResolver(champions: readonly ChampionChoice[]): (raw: unknown) => ChampionChoice | null {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const byKey = new Map<string, ChampionChoice>();
  for (const c of champions) for (const k of [looseKey(c.id), looseKey(c.name)]) if (k && !byKey.has(k)) byKey.set(k, c);
  return (raw) => {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s || s.length > MAX_PARAM) return null;
    return byId.get(s) ?? byKey.get(looseKey(s)) ?? null;
  };
}

/** A revision time as a source may give it: an ISO time in UTC ("2026-09-23T19:37:45Z"). */
const REVISION_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;

/**
 * A curated text as the page draws it: each number held to its unit by a no-break space ("1.625 s"),
 * so a line never ends between them. Every curated text reaches the page through here; anything that
 * is not a string is passed on as it is (the notes' own checks refuse it).
 */
function drawn<T>(text: T): T {
  return (typeof text === "string" ? keepUnitsWithNumbers(text) : text) as T;
}

/** A fact's or a note's source, as the page links it: its title, its address when it is an allowed one ("" otherwise), and when the page read was saved. */
function sourceLink(sources: readonly Source[], id: string): SourceLinkView {
  const s = sources.find((x) => x.id === id);
  return { title: s?.title ?? "", url: s ? (safeSourceUrl(s.url) ?? "") : "", revisionTime: s && typeof s.revisionTime === "string" && REVISION_TIME.test(s.revisionTime) ? s.revisionTime : null };
}

const SUBJECTS: ReadonlySet<string> = new Set<FactSubject>(["self", "target", "allies", "area"]);
const TAGS: ReadonlySet<string> = new Set<string>(FACT_TAGS);

/** A fact as the page shows it: who has the effect when the notes say, its tags from the vocabulary only (each once), and its source's link. */
function factView(f: Fact, sources: readonly Source[]): FactView {
  const tags = Array.isArray(f.tags) ? f.tags.filter((t, i, all): t is FactTag => typeof t === "string" && TAGS.has(t) && all.indexOf(t) === i) : [];
  return { kind: f.kind, label: drawn(f.label), detail: drawn(f.detail ?? null), appliesTo: typeof f.appliesTo === "string" && SUBJECTS.has(f.appliesTo) ? f.appliesTo : null, tags, source: sourceLink(sources, f.source) };
}

/** Copies of the sources, each address kept only when it is an allowed one. */
function safeSources(sources: readonly Source[]): Source[] {
  return sources.map((s) => ({ ...s, url: safeSourceUrl(s.url) ?? "" }));
}

/** The freshness of a set of curated notes from its abilities'; with none to compare, by version alone (never "current" without the version checked). */
function freshnessOf(values: readonly Freshness[], verifiedVersion: string, dataVersion: string | null): Freshness {
  if (values.length) return weakestFreshness(values);
  return dataVersion !== null && dataVersion === verifiedVersion ? "current" : "unchanged-since";
}

/**
 * How far the game has moved past notes checked on `verifiedVersion`: the newest of `versions` (the
 * data's, and the game's current one) when its patch is later than the check's, with how many
 * patches came since (patchesAfter: the known list where it covers them, never fewer than the
 * numbering shows). Null when none is later, a later build of the same patch included, or nothing
 * is a version. It compares versions, not Riot's records: notes on an unchanged record still have
 * not been checked for the newer patch.
 */
export function recheckOf(verifiedVersion: string, versions: ReadonlyArray<string | null | undefined>, knownPatches: readonly string[] = []): Recheck | null {
  const from = typeof verifiedVersion === "string" ? patchFromVersion(verifiedVersion) : null;
  if (!from || compareDdragonVersions(verifiedVersion, verifiedVersion) === null) return null;
  let newest: string | null = null;
  for (const v of versions) {
    if (typeof v !== "string" || compareDdragonVersions(v, verifiedVersion) === null) continue;
    if (newest === null || compareDdragonVersions(v, newest)! > 0) newest = v;
  }
  const to = newest ? patchFromVersion(newest) : null;
  if (!newest || !to || compareDdragonVersions(newest, verifiedVersion)! <= 0) return null;
  const patches = patchesAfter(from, to, knownPatches);
  return patches > 0 ? { patch: publicPatchName(to), patches, expired: patches > MAX_PATCHES_UNCHECKED } : null;
}

/**
 * One champion's abilities in slot order, with its curated notes where they exist; null when none
 * are stored yet. Each ability's freshness comes first, because it decides the line: while the
 * notes still describe Riot's record, their cooldown is the line; once Riot's record moved after
 * the check, the line is what Riot's data alone supports, and the notes' cooldown is kept as it was
 * checked (`checkedCooldown`), to be shown with the notes, flagged.
 */
function abilityViews(data: DdragonChampionAbilities | null, notes: ChampionNotes | null): AbilityView[] | null {
  if (!data) return null;
  const bySlot = new Map(data.abilities.map((a) => [a.slot, a]));
  return SLOTS.flatMap((slot): AbilityView[] => {
    const a = bySlot.get(slot);
    if (!a) return [];
    const n = notes ? notes.abilities[slot] : undefined;
    const freshness = n && notes ? abilityFreshness(a, n, notes.verified.ddragonVersion, data.version) : null;
    const changed = freshness === "changed-since" && n ? abilityChanges(a, n) : [];
    // The notes' spec as checked: against the ranks Riot gave then, where the notes say them.
    const checkedRanks = n?.ddragonIdentity && Number.isInteger(n.ddragonIdentity.maxRank) ? n.ddragonIdentity.maxRank : null;
    return [
      {
        slot,
        name: a.name,
        icon: abilityIconUrl(data.version, slot, a.icon),
        maxRank: a.maxRank,
        cooldown: cooldownDisplay(a, n, freshness),
        checkedCooldown: freshness === "changed-since" && n?.cooldown ? curatedCooldownDisplay(n.cooldown, checkedRanks) : null,
        changes: changed,
        cooldownNote: drawn(n?.cooldownNote ?? null),
        modifiers: drawnModifiers(modifiersView(n?.modifiers, freshness === "changed-since" ? checkedRanks : a.maxRank)),
        recast: n?.recast ? { ...n.recast, note: drawn(n.recast.note) } : null,
        facts: n && notes ? n.facts.map((f) => factView(f, notes.sources)) : [],
        description: a.description,
        details: n?.details ? n.details.map(drawn) : [],
        freshness,
      },
    ];
  });
}

/** The modifiers as the page draws them: what gives a refund back is curated text. */
function drawnModifiers(m: ReturnType<typeof modifiersView>): ReturnType<typeof modifiersView> {
  return m?.refund ? { ...m, refund: { ...m.refund, when: drawn(m.refund.when) } } : m;
}

/** What a champion's intel is read with beyond its record and notes. */
interface IntelContext {
  /** The record is the committed offline copy. */
  offline: boolean;
  /** A record is stored that cannot be read. */
  unreadable: boolean;
  /** The game's current Data Dragon version, when the app knows it (not while it runs on the offline fixture). */
  currentVersion: string | null;
  knownPatches: readonly string[];
}

/** One champion's intelligence: Data Dragon's abilities, and the curated layer when there is one. */
function championIntel(champion: ChampionChoice, data: DdragonChampionAbilities | null, notes: ChampionNotes | null, context: IntelContext): ChampionIntelView {
  const dataVersion = data?.version ?? null;
  const bySlot = new Map((data?.abilities ?? []).map((a) => [a.slot, a]));
  const freshnessBySlot = new Map<Slot, Freshness>();
  if (notes) {
    for (const slot of SLOTS) {
      const n = notes.abilities[slot];
      if (n) freshnessBySlot.set(slot, abilityFreshness(bySlot.get(slot) ?? null, n, notes.verified.ddragonVersion, dataVersion));
    }
  }
  const curated = notes
    ? {
        verified: { ...notes.verified },
        freshness: freshnessOf([...freshnessBySlot.values()], notes.verified.ddragonVersion, dataVersion),
        recheck: recheckOf(notes.verified.ddragonVersion, [dataVersion, context.currentVersion], context.knownPatches),
      }
    : null;
  // A level note rests on abilities of its own champion; once Riot changed one of them after the
  // check, it is flagged, as that ability's notes are.
  const changedSlot = (slot: unknown) => typeof slot === "string" && freshnessBySlot.get(slot as Slot) === "changed-since";
  return {
    champion,
    dataVersion,
    offlineCopy: !!data && context.offline,
    abilities: abilityViews(data, notes),
    abilitiesUnreadable: !data && context.unreadable,
    curated,
    levelNotes: notes
      ? [...(notes.levelNotes ?? [])]
          .sort((a, b) => a.level - b.level)
          .map((l) => ({ level: l.level, text: drawn(l.text), source: sourceLink(notes.sources, l.source), changed: Array.isArray(l.basedOn) && l.basedOn.some(changedSlot) }))
      : [],
    sources: notes ? safeSources(notes.sources) : [],
  };
}

const REF = /^([A-Za-z0-9]{1,40})\.(P|Q|W|E|R)$/;

/** The ability a briefing point rests on, when it is one of the two champions' (anything else is left out). */
function refOf(ref: string, ids: ReadonlySet<string>): { championId: string; slot: Slot } | null {
  const m = REF.exec(ref);
  return m && ids.has(m[1]!) ? { championId: m[1]!, slot: m[2] as Slot } : null;
}

/**
 * How fresh a matchup is for one ability it rests on. A matchup holds no numbers of its own, only
 * the Data Dragon version it was checked against (`checked`); the numbers a person took are the
 * champion's notes', on the version those were checked on. So:
 *   - the data shown is the matchup's own version: it was checked against exactly this ("current");
 *   - the champion's notes took their numbers on that version or later, and the data shown is at
 *     least as new as them: numbers that moved since moved after the matchup's check too
 *     ("changed-since", as abilityFreshness compares them);
 *   - anything else is not known (numbers taken before the matchup's check, data older than them,
 *     no notes): "unchanged-since", which the page says only as "Checked on patch N".
 * Comparing with numbers taken on another version than the matchup's would warn about a change the
 * matchup's check already saw, or stay quiet about one it did not. The committed notes never differ
 * so: curated.test.ts holds a matchup and the champion notes it rests on to one Data Dragon version,
 * so their numbers are the ones the matchup was checked with, and the other cases only keep notes
 * from anywhere else from claiming more than is known.
 */
function matchupAbilityFreshness(checked: string, data: DdragonChampionAbilities | null, slot: Slot, notes: ChampionNotes | null): Freshness {
  if (data && data.version === checked) return "current";
  const own = notes?.abilities[slot];
  if (!data || !notes || !own) return "unchanged-since";
  const taken = notes.verified.ddragonVersion;
  const takenSinceCheck = compareDdragonVersions(taken, checked);
  const dataSinceTaken = compareDdragonVersions(data.version, taken);
  if (takenSinceCheck === null || dataSinceTaken === null || takenSinceCheck < 0 || dataSinceTaken < 0) return "unchanged-since";
  const ability = data.abilities.find((a) => a.slot === slot) ?? null;
  return abilityFreshness(ability, own, taken, data.version) === "changed-since" ? "changed-since" : "unchanged-since";
}

/**
 * The curated matchup, ready to show: its briefing and interactions resting only on the two
 * champions' abilities, its sources' links checked, and how fresh it is against Riot's current
 * data for the abilities it rests on (matchupAbilityFreshness).
 *
 * A point, the threat, the opportunity or an interaction that rests on an ability Riot changed
 * after the matchup was checked ("changed-since") is hidden: its text stays on the server, and the
 * page says in its place which abilities changed. The rest keep their "Checked on patch N", and the
 * matchup's freshness is that of what it shows.
 *
 * Once more than MAX_PATCHES_UNCHECKED patches have come since its check (against both champions'
 * data and the game's current version), the briefing and the interactions are hidden as a whole,
 * whatever Riot's records say: most changes never show in them. The page says why.
 */
function matchupIntel(notes: MatchupNotes, ids: ReadonlySet<string>, data: Record<string, DdragonChampionAbilities | null>, championNotes: Record<string, ChampionNotes | null>, context: { currentVersion: string | null; knownPatches: readonly string[] }): MatchupIntelView {
  const verified = notes.verified.ddragonVersion;
  const recheck = recheckOf(verified, [...[...ids].map((id) => data[id]?.version ?? null), context.currentVersion], context.knownPatches);
  if (recheck?.expired) {
    return { verified: { ...notes.verified }, freshness: "unchanged-since", recheck, briefing: null, interactions: [], expiredInteractions: notes.interactions.length, sources: safeSources(notes.sources) };
  }
  const keep = (refs: readonly AbilityRef[]) => refs.filter((r) => refOf(r, ids) !== null);
  const freshness = new Map<AbilityRef, Freshness>();
  const freshnessOfRef = (r: AbilityRef): Freshness => {
    let f = freshness.get(r);
    if (!f) {
      const { championId, slot } = refOf(r, ids)!;
      f = matchupAbilityFreshness(verified, data[championId] ?? null, slot, championNotes[championId] ?? null);
      freshness.set(r, f);
    }
    return f;
  };
  /** The abilities among `refs` that Riot changed after the check, each once. */
  const changedOf = (refs: readonly AbilityRef[]) => refs.filter((r, i) => refs.indexOf(r) === i && freshnessOfRef(r) === "changed-since");
  const point = (p: BriefingPoint): BriefingPointView => {
    const basedOn = keep(p.basedOn);
    const changed = changedOf(basedOn);
    return changed.length ? { kind: "hidden", changed } : { kind: "point", text: drawn(p.text), basedOn };
  };
  const briefing = { threat: point(notes.briefing.threat), opportunity: point(notes.briefing.opportunity), lane: notes.briefing.lane.map(point) };
  const interactions = notes.interactions.map((i): InteractionView => {
    const abilities = keep(i.abilities);
    const changed = changedOf(abilities);
    return changed.length ? { kind: "hidden", changed } : { kind: "interaction", text: drawn(i.text), abilities, source: i.source };
  });
  const shown = [briefing.threat, briefing.opportunity, ...briefing.lane].flatMap((p) => (p.kind === "point" ? p.basedOn : []));
  const values = [...shown, ...interactions.flatMap((i) => (i.kind === "interaction" ? i.abilities : []))].map(freshnessOfRef);
  const dataVersions = [...ids].map((id) => data[id]?.version ?? null);
  const dataVersion = dataVersions.every((v) => v !== null && v === dataVersions[0]) ? dataVersions[0]! : null;
  return { verified: { ...notes.verified }, freshness: freshnessOf(values, verified, dataVersion), recheck, briefing, interactions, expiredInteractions: 0, sources: safeSources(notes.sources) };
}

/** Everything the page shows for one choice of champions (docs/MATCHUP_INTEL.md). */
export async function buildMatchupPageView(input: { champion?: string; vs?: string }, deps: MatchupViewDeps): Promise<MatchupPageView> {
  const resolve = championResolver(deps.champions);
  const you = resolve(input.champion);
  const enemy = resolve(input.vs);
  const ids = [...new Set([you?.id, enemy?.id].filter((id): id is string => !!id))];
  const loaded: Awaited<ReturnType<MatchupViewDeps["loadAbilities"]>> = ids.length ? await deps.loadAbilities(ids) : { version: null, champions: {} };
  const data: Record<string, DdragonChampionAbilities | null> = Object.fromEntries(ids.map((id) => [id, loaded.champions[id] ?? null]));
  const notes: Record<string, ChampionNotes | null> = Object.fromEntries(
    ids.map((id) => {
      const n = deps.championNotes(id);
      return [id, n && n.championId === id ? n : null];
    }),
  );
  const offline = new Set(loaded.offline ?? []);
  const unreadable = new Set(loaded.unreadable ?? []);
  const currentVersion = deps.currentPatch?.ddragonVersion ?? null;
  const knownPatches = deps.knownPatches ?? [];
  const intel = (c: ChampionChoice | null) => (c ? championIntel(c, data[c.id] ?? null, notes[c.id] ?? null, { offline: offline.has(c.id), unreadable: unreadable.has(c.id), currentVersion, knownPatches }) : null);
  const curatedMatchup = you && enemy ? deps.matchupNotes(you.id, enemy.id) : null;
  // This direction only: notes for the enemy against your champion are another matchup.
  const matchup = curatedMatchup && you && enemy && curatedMatchup.championId === you.id && curatedMatchup.vsId === enemy.id ? matchupIntel(curatedMatchup, new Set(ids), data, notes, { currentVersion, knownPatches }) : null;
  const dataVersion = (enemy ? data[enemy.id]?.version : null) ?? (you ? data[you.id]?.version : null) ?? loaded.version;
  return {
    you,
    enemy,
    enemyIntel: intel(enemy),
    yourIntel: intel(you),
    matchup,
    patch: { current: deps.currentPatch ? publicPatchName(deps.currentPatch.patch) : null, data: publicPatchOf(dataVersion ?? null) },
  };
}

/** The roster as the pickers show it. */
export function championChoices(list: readonly ChampionSummary[]): ChampionChoice[] {
  return list.map((c) => ({ id: c.id, name: c.name, title: c.title, portrait: c.portraitUrl }));
}

/** For every champion with curated matchups, the enemies they exist for (ids on the roster only), for the pickers and the links to them. */
export function curatedIndex(champions: readonly ChampionChoice[], enemiesFor: (championId: string) => readonly string[]): Record<string, string[]> {
  const known = new Set(champions.map((c) => c.id));
  const out: Record<string, string[]> = {};
  for (const c of champions) {
    const enemies = [...new Set(enemiesFor(c.id))].filter((id) => known.has(id));
    if (enemies.length) out[c.id] = enemies;
  }
  return out;
}

/** The curated index per roster: the notes are committed with the code, so one per roster list is enough. */
const indexes = new WeakMap<readonly ChampionSummary[], Record<string, string[]>>();

/**
 * The patches the app has seen, newest first: a few dozen short rows, cached for a minute like the
 * current patch (a static sync that changes the patches clears both: invalidateChampionCaches).
 */
const knownPatchesOf = (db: Db) => cachedFor("patch:known", 60_000, () => listPatchesDesc(db), db);

/** What the page needs, from the real modules. */
export async function loadMatchupPage(db: Db, input: { champion?: string; vs?: string }): Promise<{ view: MatchupPageView; champions: ChampionChoice[]; curated: Record<string, string[]> }> {
  const [list, current, knownPatches] = await Promise.all([listChampions(db), getCurrentPatch(db), knownPatchesOf(db)]);
  const champions = championChoices(list);
  const view = await buildMatchupPageView(input, {
    champions,
    currentPatch: current && !current.isFixture ? { patch: current.patch, ddragonVersion: current.ddragonVersion } : null,
    loadAbilities: (ids) => loadChampionAbilities(db, ids),
    knownPatches,
    championNotes: getChampionNotes,
    matchupNotes: getMatchupNotes,
  });
  let curated = indexes.get(list);
  if (!curated) {
    curated = curatedIndex(champions, curatedEnemiesFor);
    indexes.set(list, curated);
  }
  return { view, champions, curated };
}
