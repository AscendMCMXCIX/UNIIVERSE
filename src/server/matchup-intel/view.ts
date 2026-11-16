import type { Db } from "@/server/db/types";
import { SLOTS, type AbilityRef, type AbilityView, type ChampionChoice, type ChampionIntelView, type ChampionNotes, type DdragonChampionAbilities, type Freshness, type MatchupIntelView, type MatchupNotes, type MatchupPageView, type Slot, type Source } from "@/domain/matchup-intel/types";
import { abilityFreshness, cooldownDisplay, weakestFreshness } from "@/domain/matchup-intel/cooldown";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import { getCurrentPatch, listChampions, type ChampionSummary } from "@/server/repositories/champions";
import { loadChampionAbilities } from "./abilities";
import { curatedEnemiesFor, getChampionNotes, getMatchupNotes } from "./curated";

/*
  MATCHUP INTEL's page, built on the server (docs/MATCHUP_INTEL.md): the two champions chosen in the
  address, checked against the roster, each with its abilities from Data Dragon and the curated
  notes that exist, and the curated matchup for this direction only. Plain data goes to the browser
  (MatchupPageView); the curated dataset and these modules never do (src/app/client-imports.test.ts).

  The work is what the page needs and no more: the session (the page's own check), the cached
  roster and current patch, and the stored abilities of the one or two champions chosen. The
  curated notes are committed with the code, so reading them costs no request.
*/

/** What the view is built from, injected so it is tested without a database. */
export interface MatchupViewDeps {
  /** Every active champion (the cached roster). */
  champions: readonly ChampionChoice[];
  /** The current patch as stored ("16.22", Data Dragon "16.22.1"); null when none is known yet, or it is the offline fixture. */
  currentPatch: { patch: string; ddragonVersion: string } | null;
  /** The stored Data Dragon abilities of these champions (null for one with none stored yet). */
  loadAbilities: (championIds: readonly string[]) => Promise<{ version: string | null; champions: Record<string, DdragonChampionAbilities | null> }>;
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

/** Two Data Dragon versions in order, by number ("16.9.1" before "16.10.1"); null when either is not a version. */
function compareVersions(a: string, b: string): number | null {
  if (!VERSION.test(a) || !VERSION.test(b)) return null;
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
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

/** A fact's or a note's source, as the page links it: its title, and its address when it is an allowed one ("" otherwise). */
function sourceLink(sources: readonly Source[], id: string): { title: string; url: string } {
  const s = sources.find((x) => x.id === id);
  return { title: s?.title ?? "", url: s ? (safeSourceUrl(s.url) ?? "") : "" };
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

/** One champion's abilities in slot order, with its curated notes where they exist; null when none are stored yet. */
function abilityViews(data: DdragonChampionAbilities | null, notes: ChampionNotes | null): AbilityView[] | null {
  if (!data) return null;
  const bySlot = new Map(data.abilities.map((a) => [a.slot, a]));
  return SLOTS.flatMap((slot): AbilityView[] => {
    const a = bySlot.get(slot);
    if (!a) return [];
    const n = notes?.abilities[slot];
    return [
      {
        slot,
        name: a.name,
        icon: abilityIconUrl(data.version, slot, a.icon),
        maxRank: a.maxRank,
        cooldown: cooldownDisplay(a, n),
        cooldownNote: n?.cooldownNote ?? null,
        recast: n?.recast ? { ...n.recast } : null,
        facts: n && notes ? n.facts.map((f) => ({ kind: f.kind, label: f.label, detail: f.detail ?? null, source: sourceLink(notes.sources, f.source) })) : [],
        description: a.description,
        details: n?.details ? [...n.details] : [],
        freshness: n && notes ? abilityFreshness(a, n, notes.verified.ddragonVersion, data.version) : null,
      },
    ];
  });
}

/** One champion's intelligence: Data Dragon's abilities, and the curated layer when there is one. */
function championIntel(champion: ChampionChoice, data: DdragonChampionAbilities | null, notes: ChampionNotes | null): ChampionIntelView {
  const dataVersion = data?.version ?? null;
  const bySlot = new Map((data?.abilities ?? []).map((a) => [a.slot, a]));
  const curated = notes
    ? {
        verified: { ...notes.verified },
        freshness: freshnessOf(
          SLOTS.flatMap((slot) => {
            const n = notes.abilities[slot];
            return n ? [abilityFreshness(bySlot.get(slot) ?? null, n, notes.verified.ddragonVersion, dataVersion)] : [];
          }),
          notes.verified.ddragonVersion,
          dataVersion,
        ),
      }
    : null;
  return {
    champion,
    dataVersion,
    abilities: abilityViews(data, notes),
    curated,
    levelNotes: notes ? [...(notes.levelNotes ?? [])].sort((a, b) => a.level - b.level).map((l) => ({ level: l.level, text: l.text, source: sourceLink(notes.sources, l.source) })) : [],
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
 * matchup's check already saw, or stay quiet about one it did not.
 */
function matchupAbilityFreshness(checked: string, data: DdragonChampionAbilities | null, slot: Slot, notes: ChampionNotes | null): Freshness {
  if (data && data.version === checked) return "current";
  const own = notes?.abilities[slot];
  if (!data || !notes || !own) return "unchanged-since";
  const taken = notes.verified.ddragonVersion;
  const takenSinceCheck = compareVersions(taken, checked);
  const dataSinceTaken = compareVersions(data.version, taken);
  if (takenSinceCheck === null || dataSinceTaken === null || takenSinceCheck < 0 || dataSinceTaken < 0) return "unchanged-since";
  const ability = data.abilities.find((a) => a.slot === slot) ?? null;
  return abilityFreshness(ability, own, taken, data.version) === "changed-since" ? "changed-since" : "unchanged-since";
}

/**
 * The curated matchup, ready to show: its briefing and interactions resting only on the two
 * champions' abilities, its sources' links checked, and how fresh it is against Riot's current
 * numbers for the abilities it rests on (matchupAbilityFreshness).
 */
function matchupIntel(notes: MatchupNotes, ids: ReadonlySet<string>, data: Record<string, DdragonChampionAbilities | null>, championNotes: Record<string, ChampionNotes | null>): MatchupIntelView {
  const keep = (refs: readonly AbilityRef[]) => refs.filter((r) => refOf(r, ids) !== null);
  const briefing: MatchupNotes["briefing"] = {
    threat: { text: notes.briefing.threat.text, basedOn: keep(notes.briefing.threat.basedOn) },
    opportunity: { text: notes.briefing.opportunity.text, basedOn: keep(notes.briefing.opportunity.basedOn) },
    lane: notes.briefing.lane.map((p) => ({ text: p.text, basedOn: keep(p.basedOn) })),
  };
  const interactions = notes.interactions.map((i) => ({ text: i.text, abilities: keep(i.abilities), source: i.source }));
  const refs = [...briefing.threat.basedOn, ...briefing.opportunity.basedOn, ...briefing.lane.flatMap((p) => p.basedOn), ...interactions.flatMap((i) => i.abilities)];
  const verified = notes.verified.ddragonVersion;
  const values = refs.map((r): Freshness => {
    const { championId, slot } = refOf(r, ids)!;
    return matchupAbilityFreshness(verified, data[championId] ?? null, slot, championNotes[championId] ?? null);
  });
  const dataVersions = [...ids].map((id) => data[id]?.version ?? null);
  const dataVersion = dataVersions.every((v) => v !== null && v === dataVersions[0]) ? dataVersions[0]! : null;
  return { verified: { ...notes.verified }, freshness: freshnessOf(values, verified, dataVersion), briefing, interactions, sources: safeSources(notes.sources) };
}

/** Everything the page shows for one choice of champions (docs/MATCHUP_INTEL.md). */
export async function buildMatchupPageView(input: { champion?: string; vs?: string }, deps: MatchupViewDeps): Promise<MatchupPageView> {
  const resolve = championResolver(deps.champions);
  const you = resolve(input.champion);
  const enemy = resolve(input.vs);
  const ids = [...new Set([you?.id, enemy?.id].filter((id): id is string => !!id))];
  const loaded = ids.length ? await deps.loadAbilities(ids) : { version: null, champions: {} as Record<string, DdragonChampionAbilities | null> };
  const data: Record<string, DdragonChampionAbilities | null> = Object.fromEntries(ids.map((id) => [id, loaded.champions[id] ?? null]));
  const notes: Record<string, ChampionNotes | null> = Object.fromEntries(
    ids.map((id) => {
      const n = deps.championNotes(id);
      return [id, n && n.championId === id ? n : null];
    }),
  );
  const intel = (c: ChampionChoice | null) => (c ? championIntel(c, data[c.id] ?? null, notes[c.id] ?? null) : null);
  const curatedMatchup = you && enemy ? deps.matchupNotes(you.id, enemy.id) : null;
  // This direction only: notes for the enemy against your champion are another matchup.
  const matchup = curatedMatchup && you && enemy && curatedMatchup.championId === you.id && curatedMatchup.vsId === enemy.id ? matchupIntel(curatedMatchup, new Set(ids), data, notes) : null;
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

/** What the page needs, from the real modules. */
export async function loadMatchupPage(db: Db, input: { champion?: string; vs?: string }): Promise<{ view: MatchupPageView; champions: ChampionChoice[]; curated: Record<string, string[]> }> {
  const [list, current] = await Promise.all([listChampions(db), getCurrentPatch(db)]);
  const champions = championChoices(list);
  const view = await buildMatchupPageView(input, {
    champions,
    currentPatch: current && !current.isFixture ? { patch: current.patch, ddragonVersion: current.ddragonVersion } : null,
    loadAbilities: (ids) => loadChampionAbilities(db, ids),
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
