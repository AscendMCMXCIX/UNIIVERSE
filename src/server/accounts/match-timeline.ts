import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, matchTimelines, type MatchEvents, type MatchFramePlayer, type MatchFrames, type MatchObjectiveEvent, type MatchPlateEvent, type MatchTimelineParticipant } from "@/server/db/schema";
import type { RiotMatchTimeline } from "@/server/riot/api/schemas";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { assetUrl, ddragonVersionOf, loadRiotAssets } from "@/server/riot/static/assets";
import { getCurrentPatch } from "@/server/repositories/champions";
import { erasureFilter } from "@/server/privacy/ledger";
import { redactTimeline } from "@/server/privacy/redact";
import { loadCompositionParticipants } from "@/server/matches/compositions";
import { LANE_MINUTES, goldContradictsRecord, laneMoments, botPairOf, laneOpponentOf, pairMoments, teamGoldDifference, type GoldPoint, type LaneMoment, type LaneSeat } from "@/domain/match-analysis";
import type { ScoreTimeline } from "@/domain/performance-inputs";
import type { TimelineEventsView } from "@/domain/match-events";
import { buildPath, type BuildEvent } from "@/domain/build-path";

/*
  One match minute by minute, from Riot's match timeline: the build and skill order, the lane at
  10:00 and 15:00, the two teams' gold difference over the game, and the kills and objectives along
  it. The timeline is a separate request Riot makes per match, so it is never fetched while a page
  renders or during the account sync: it is fetched once, when a player first opens that match's
  breakdown or when the timeline backfill reaches it, and kept compactly: the purchases and skill
  level-ups, when each player took part in a champion kill, each player's gold, experience and CS
  at every frame, and the objectives and buildings each team took. From 20 Nov 2026 on also each
  player's place on the map, ability haste and level at every frame, when they reached each level,
  what they sold and what was used up (potions, wards, components), and the turret plates each team
  took (nothing else of the frames or events). Timelines kept before the kills and objectives were
  (29 Oct 2026) are fetched again once, the next time someone opens their Timeline; older timelines
  are never fetched again for the newer fields. Nothing is reconstructed from the final inventory or
  the final figures: without a timeline the page says so.
*/

/**
 * Each player's gold, experience and CS at every frame, aligned with the frames' own timestamps, and
 * where Riot sent them in every one of the player's frames, their place on the map (x and y), ability
 * haste and level.
 */
export function timelineFrames(t: RiotMatchTimeline): MatchFrames {
  const puuidOf = new Map<number, string>(t.info.participants.map((p) => [p.participantId, p.puuid]));
  if (!puuidOf.size) t.metadata.participants.forEach((puuid, i) => puuidOf.set(i + 1, puuid));
  const frames = t.info.frames.filter((f) => typeof f.timestamp === "number" && f.participantFrames && Object.keys(f.participantFrames).length);
  // Frames come in order; sorted anyway so interpolation can rely on it.
  frames.sort((a, b) => a.timestamp! - b.timestamp!);
  const out: MatchFrames = { t: frames.map((f) => f.timestamp!), p: {} };
  for (const [id, puuid] of puuidOf) {
    const row = { g: [] as number[], x: [] as number[], c: [] as number[] };
    const px: number[] = [];
    const py: number[] = [];
    const ah: number[] = [];
    const lv: number[] = [];
    let complete = true;
    for (const f of frames) {
      const pf = f.participantFrames![String(id)];
      if (!pf || pf.totalGold === undefined || pf.xp === undefined) {
        complete = false;
        break;
      }
      row.g.push(pf.totalGold);
      row.x.push(pf.xp);
      row.c.push((pf.minionsKilled ?? 0) + (pf.jungleMinionsKilled ?? 0));
      if (pf.position && Number.isFinite(pf.position.x) && Number.isFinite(pf.position.y)) {
        px.push(Math.round(pf.position.x));
        py.push(Math.round(pf.position.y));
      }
      const haste = pf.championStats?.abilityHaste;
      if (typeof haste === "number" && Number.isFinite(haste)) ah.push(haste);
      if (typeof pf.level === "number" && Number.isFinite(pf.level)) lv.push(pf.level);
    }
    // A player with a gap in the frames is left out rather than given invented values, and so is
    // any newer series with a gap of its own (the others are kept).
    if (complete && frames.length) {
      const all = frames.length;
      out.p[puuid] = { ...row, ...(px.length === all ? { px, py } : {}), ...(ah.length === all ? { ah } : {}), ...(lv.length === all ? { lv } : {}) };
    }
  }
  return out;
}

/** The stored row for a fetched timeline (or for one Riot no longer provides). */
export function timelineRow(matchId: string, platform: string, timeline: RiotMatchTimeline | null): typeof matchTimelines.$inferInsert {
  return timeline
    ? { matchId, platform, participants: timelineParticipants(timeline), frames: timelineFrames(timeline), events: timelineEvents(timeline) }
    : { matchId, platform, participants: [], frames: { t: [], p: {} }, events: { objectives: [], missing: true } };
}

const DRAGON_ELEMENT: Record<string, string> = { FIRE_DRAGON: "FIRE", EARTH_DRAGON: "EARTH", WATER_DRAGON: "WATER", AIR_DRAGON: "AIR", HEXTECH_DRAGON: "HEXTECH", CHEMTECH_DRAGON: "CHEMTECH" };
const MONSTER_KIND: Record<string, MatchObjectiveEvent["kind"]> = { DRAGON: "dragon", BARON_NASHOR: "baron", RIFTHERALD: "herald", HORDE: "grubs", ATAKHAN: "atakhan" };
const LANE: Record<string, string> = { TOP_LANE: "TOP", MID_LANE: "MID", BOT_LANE: "BOT" };
const TOWER_TIER: Record<string, string> = { OUTER_TURRET: "OUTER", INNER_TURRET: "INNER", BASE_TURRET: "BASE", NEXUS_TURRET: "NEXUS" };

/**
 * The objectives and buildings each team took, in order: epic monsters (dragons with their element,
 * the Elder Dragon, Baron, the Rift Herald, voidgrubs, Atakhan), towers and inhibitors; and apart
 * from them, the turret plates (`plates`, with their lane). Team facts only: who took part is not
 * kept here. Riot names the side that lost a building or a plate; the other side took it.
 */
export function timelineEvents(t: RiotMatchTimeline): MatchEvents {
  // Riot's participants 1 to 5 play on the blue side (100), 6 to 10 on the red side (200).
  const sideOf = (participantId: number | undefined) => (participantId && participantId >= 1 && participantId <= 10 ? (participantId <= 5 ? 100 : 200) : null);
  const objectives: MatchObjectiveEvent[] = [];
  const plates: MatchPlateEvent[] = [];
  for (const e of t.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp)) {
    if (e.type === "TURRET_PLATE_DESTROYED") {
      const lane = LANE[e.laneType ?? ""];
      if (lane && (e.teamId === 100 || e.teamId === 200)) plates.push({ t: e.timestamp, team: e.teamId === 100 ? 200 : 100, lane });
      continue;
    }
    if (e.type === "ELITE_MONSTER_KILL") {
      const kind = MONSTER_KIND[e.monsterType ?? ""];
      const team = e.killerTeamId === 100 || e.killerTeamId === 200 ? e.killerTeamId : sideOf(e.killerId);
      if (!kind || !team) continue;
      if (kind === "dragon" && e.monsterSubType === "ELDER_DRAGON") objectives.push({ t: e.timestamp, team, kind: "elder" });
      else objectives.push({ t: e.timestamp, team, kind, ...(kind === "dragon" && DRAGON_ELEMENT[e.monsterSubType ?? ""] ? { detail: DRAGON_ELEMENT[e.monsterSubType!] } : {}) });
    } else if (e.type === "BUILDING_KILL") {
      const kind = e.buildingType === "TOWER_BUILDING" ? "tower" : e.buildingType === "INHIBITOR_BUILDING" ? "inhibitor" : null;
      if (!kind || (e.teamId !== 100 && e.teamId !== 200)) continue;
      const detail = [LANE[e.laneType ?? ""], kind === "tower" ? TOWER_TIER[e.towerType ?? ""] : undefined].filter(Boolean).join(" ");
      objectives.push({ t: e.timestamp, team: e.teamId === 100 ? 200 : 100, kind, ...(detail ? { detail } : {}) });
    }
  }
  return { objectives, plates };
}

/**
 * A timeline as it is kept: only the players the game's stored record still names. A player whose
 * personal data was erased is a "Removed player" there, so their purchases, skills and per-frame
 * figures are not kept either; before the game's record exists, the erasure records decide.
 */
export async function keptTimeline(db: Db, row: typeof matchTimelines.$inferInsert): Promise<typeof matchTimelines.$inferInsert> {
  if (!row.participants.length) return row;
  const result = await db.execute(sql`SELECT p->>'puuid' AS puuid FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p WHERE d.match_id = ${row.matchId}`);
  const stored = ((result as { rows?: unknown[] }).rows ?? result) as Array<{ puuid: string | null }>;
  const erased = await erasureFilter(db);
  if (stored.length) {
    const named = new Set(stored.map((r) => r.puuid ?? "").filter(Boolean));
    return redactTimeline(row, (puuid) => named.has(puuid) && !erased.puuid(puuid));
  }
  return erased.empty ? row : redactTimeline(row, (puuid) => !erased.puuid(puuid));
}

/**
 * A timeline fetched again, added to the one kept before (if any) without replacing what that held:
 * each player's stored purchases and skills stay, and the answer only fills what the row lacked
 * (kill, death and assist times, frames, the objectives, and the fields kept from 20 Nov 2026 on:
 * level times, sales, items used up, the turret plates, and each player's place, haste and level at
 * frames that are the answer's own frames). Both have been through keptTimeline, so a player erased
 * since appears in neither. A timeline Riot no longer provides keeps everything kept.
 */
export function completedTimeline(stored: Pick<TimelineRow, "participants" | "frames" | "events"> | undefined, fresh: typeof matchTimelines.$inferInsert): Pick<typeof matchTimelines.$inferInsert, "participants" | "frames" | "events"> {
  if (!stored) return { participants: fresh.participants, frames: fresh.frames, events: fresh.events };
  const answer = new Map(fresh.participants.map((p) => [p.puuid, p]));
  const kept = new Set(stored.participants.map((p) => p.puuid));
  // The newer per-player lists are filled only on a timeline kept before them (no plates yet): on a
  // newer one, a list it lacks means there was nothing to keep.
  const older = !stored.events?.plates;
  const participants = stored.participants.length
    ? [
        ...stored.participants.map((p) => {
          const f = answer.get(p.puuid);
          const levels = p.levels ? { levels: p.levels, ...(p.levelFrom ? { levelFrom: p.levelFrom } : {}) } : older && f?.levels ? { levels: f.levels, ...(f.levelFrom ? { levelFrom: f.levelFrom } : {}) } : {};
          return {
            ...p,
            purchases: p.purchases.length ? p.purchases : (f?.purchases ?? []),
            skills: p.skills.length ? p.skills : (f?.skills ?? []),
            ...((p.kills ?? f?.kills) ? { kills: p.kills ?? f!.kills } : {}),
            ...((p.deaths ?? f?.deaths) ? { deaths: p.deaths ?? f!.deaths } : {}),
            ...((p.assists ?? f?.assists) ? { assists: p.assists ?? f!.assists } : {}),
            ...levels,
            ...((p.sold ?? (older ? f?.sold : undefined)) ? { sold: p.sold ?? f!.sold } : {}),
            ...((p.destroyed ?? (older ? f?.destroyed : undefined)) ? { destroyed: p.destroyed ?? f!.destroyed } : {}),
          };
        }),
        ...fresh.participants.filter((p) => !kept.has(p.puuid)),
      ]
    : fresh.participants;
  const events = stored.events && !stored.events.missing ? (stored.events.plates || !fresh.events?.plates ? stored.events : { ...stored.events, plates: fresh.events.plates }) : (fresh.events ?? stored.events);
  return { participants, frames: completedFrames(stored.frames, fresh.frames), events };
}

/** Kept frames with the newer series filled from an answer whose frames are the same frames (the same timestamps); else as kept. */
function completedFrames(stored: MatchFrames | null | undefined, fresh: MatchFrames | null | undefined): MatchFrames | null | undefined {
  if (!stored || !stored.t.length) return fresh;
  if (!fresh || fresh.t.length !== stored.t.length || fresh.t.some((ms, i) => ms !== stored.t[i])) return stored;
  const p: Record<string, MatchFramePlayer> = {};
  for (const [puuid, mine] of Object.entries(stored.p)) {
    const theirs = fresh.p[puuid];
    p[puuid] = theirs
      ? {
          ...mine,
          ...(!mine.px && theirs.px && theirs.py ? { px: theirs.px, py: theirs.py } : {}),
          ...(!mine.ah && theirs.ah ? { ah: theirs.ah } : {}),
          ...(!mine.lv && theirs.lv ? { lv: theirs.lv } : {}),
        }
      : mine;
  }
  return { t: stored.t, p };
}

/**
 * Purchases (undone ones removed), skill level-ups and the champion kills each player took part in,
 * from a Riot timeline; and when each player reached each level, what they sold and what was used
 * up (`levels`, `sold`, `destroyed`, each only when there is something to keep).
 */
export function timelineParticipants(t: RiotMatchTimeline): MatchTimelineParticipant[] {
  const puuidOf = new Map<number, string>(t.info.participants.map((p) => [p.participantId, p.puuid]));
  // Older timelines leave info.participants empty: participant n is the n-th of metadata.participants.
  if (!puuidOf.size) t.metadata.participants.forEach((puuid, i) => puuidOf.set(i + 1, puuid));
  type Entry = Required<Pick<MatchTimelineParticipant, "puuid" | "purchases" | "skills" | "kills" | "deaths" | "assists" | "sold" | "destroyed">> & { levelUps: Array<[number, number]> };
  const by = new Map<number, Entry>();
  for (const [id, puuid] of puuidOf) by.set(id, { puuid, purchases: [], skills: [], kills: [], deaths: [], assists: [], sold: [], destroyed: [], levelUps: [] });
  const events = t.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp);
  for (const e of events) {
    if (e.type === "CHAMPION_KILL") {
      // An execution (by a tower, minions or a monster) has no killer: only the death counts.
      if (e.killerId) by.get(e.killerId)?.kills.push(e.timestamp);
      if (e.victimId) by.get(e.victimId)?.deaths.push(e.timestamp);
      for (const id of new Set(e.assistingParticipantIds ?? [])) by.get(id)?.assists.push(e.timestamp);
      continue;
    }
    const p = e.participantId !== undefined ? by.get(e.participantId) : undefined;
    if (!p) continue;
    if (e.type === "ITEM_PURCHASED" && e.itemId) p.purchases.push([e.timestamp, e.itemId]);
    else if (e.type === "ITEM_SOLD" && e.itemId) p.sold.push([e.timestamp, e.itemId]);
    else if (e.type === "ITEM_DESTROYED" && e.itemId) p.destroyed.push([e.timestamp, e.itemId]);
    else if (e.type === "ITEM_UNDO" && e.beforeId) {
      // An undone purchase: drop the latest purchase of that item, and what that purchase used up
      // (the components it consumed, recorded at the same moment), which the undo gives back.
      for (let i = p.purchases.length - 1; i >= 0; i--)
        if (p.purchases[i]![1] === e.beforeId) {
          const [at] = p.purchases.splice(i, 1)[0]!;
          p.destroyed = p.destroyed.filter(([ms]) => ms !== at);
          break;
        }
    } else if (e.type === "ITEM_UNDO" && e.afterId) {
      // An undone sale: the item comes back, so the latest sale of it is dropped.
      for (let i = p.sold.length - 1; i >= 0; i--)
        if (p.sold[i]![1] === e.afterId) {
          p.sold.splice(i, 1);
          break;
        }
    } else if (e.type === "SKILL_LEVEL_UP" && e.levelUpType !== "EVOLVE" && e.skillSlot && e.skillSlot >= 1 && e.skillSlot <= 4) p.skills.push(e.skillSlot);
    else if (e.type === "LEVEL_UP" && typeof e.level === "number") p.levelUps.push([e.timestamp, e.level]);
  }
  return [...by.values()].map(({ levelUps, sold, destroyed, ...p }) => ({ ...p, ...levelsOf(levelUps), ...(sold.length ? { sold } : {}), ...(destroyed.length ? { destroyed } : {}) }));
}

/**
 * Riot's LEVEL_UP events as kept: when each level was reached, starting from the first level they
 * name (`levelFrom`, given only when it is not 2). Nothing when they skip or repeat a level: the
 * level at every frame is kept as well (`lv`), and a wrong time is worse than none.
 */
function levelsOf(levelUps: ReadonlyArray<[number, number]>): Pick<MatchTimelineParticipant, "levels" | "levelFrom"> {
  if (!levelUps.length) return {};
  // Two levels gained at once share a moment: in level order.
  const ups = [...levelUps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const from = ups[0]![1];
  if (!Number.isInteger(from) || from < 2 || ups.some(([, level], i) => level !== from + i)) return {};
  return { levels: ups.map(([ms]) => ms), ...(from !== 2 ? { levelFrom: from } : {}) };
}

export interface BuildStep {
  /** The minute the items were bought in. */
  minute: number;
  items: Array<{ id: number; name: string; url: string | null; count: number }>;
}

export interface MatchBuildView {
  steps: BuildStep[];
  /** Skill levelled at each champion level, in order: "Q", "W", "E" or "R". */
  skills: Array<"Q" | "W" | "E" | "R">;
  /** Which basic skill was maxed first, second and third, e.g. ["Q", "E", "W"]. */
  maxOrder: Array<"Q" | "W" | "E">;
}

/** Why a match's timeline cannot be shown, in words for the page. */
export type TimelineFailure = { status: "unavailable" | "not-configured" | "not-found" | "error"; message: string };

const SLOT = ["Q", "W", "E", "R"] as const;

/** Basic skills in the order they reached their last point (or, unfinished, by points then first taken). */
export function maxOrderOf(skills: number[]): Array<"Q" | "W" | "E"> {
  const points = [0, 0, 0];
  const done: number[] = [];
  for (const s of skills) {
    if (s < 1 || s > 3) continue;
    points[s - 1]! += 1;
    if (points[s - 1] === 5) done.push(s);
  }
  const rest = [1, 2, 3].filter((s) => !done.includes(s)).sort((a, b) => points[b - 1]! - points[a - 1]! || skills.indexOf(a) - skills.indexOf(b));
  return [...done, ...rest].filter((s) => points[s - 1]! > 0).map((s) => SLOT[s - 1] as "Q" | "W" | "E");
}

/** Purchases grouped by minute, the same item bought twice in a minute shown once with a count. */
export function buildSteps(purchases: Array<[number, number]>, describe: (id: number) => { name: string; url: string | null }): BuildStep[] {
  const steps: BuildStep[] = [];
  for (const [t, id] of purchases) {
    const minute = Math.floor(t / 60_000);
    let step = steps[steps.length - 1];
    if (!step || step.minute !== minute) steps.push((step = { minute, items: [] }));
    const same = step.items.find((x) => x.id === id);
    if (same) same.count += 1;
    else step.items.push({ id, count: 1, ...describe(id) });
  }
  return steps;
}

type TimelineRow = typeof matchTimelines.$inferSelect;

/** Why the kills and objectives of a stored timeline are not shown (the rest of it is). */
const EVENTS_BUSY = "Riot is limiting requests just now, so the kills and objectives are not shown yet. Open the game again in a minute.";
const EVENTS_FAILED = "Riot did not answer just now, so the kills and objectives are not shown yet. Open the game again in a moment.";
const EVENTS_NOT_CONFIGURED = "The kills and objectives appear once Riot access is configured for this site.";
const EVENTS_NOT_LOADED = "The kills and objectives of this game are not loaded yet.";

/**
 * One of the player's stored games and its timeline: read from storage, or fetched from Riot once
 * and kept (one request, at most once per match, only when someone opens it). A timeline kept
 * before the kills and objectives were is fetched once more, the same way; if Riot cannot answer
 * then, the stored timeline is shown without them (`eventsNote` says why). A failure says why.
 */
async function timelineFor(db: Db, playerId: string, matchId: string, options: { fetch?: boolean; client?: RiotApiClient | null }): Promise<{ row: TimelineRow; puuids: Set<string>; eventsNote: string | null } | TimelineFailure> {
  const accounts = await listAccountsForPlayer(db, playerId);
  if (!accounts.length) return { status: "not-found", message: "This match is not in this player's history." };
  const [mine] = await db
    .select({ accountId: accountMatches.accountId })
    .from(accountMatches)
    .where(and(eq(accountMatches.matchId, matchId), inArray(accountMatches.accountId, accounts.map((a) => a.id)), isNotNull(accountMatches.championId)));
  if (!mine) return { status: "not-found", message: "This match is not in this player's history." };
  let [row] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
  // Kept before kills and objectives were (they arrive with the next fetch).
  const dated = !!row && row.participants.length > 0 && !row.events;
  let eventsNote: string | null = dated ? EVENTS_NOT_LOADED : null;
  if ((!row || dated) && options.fetch) {
    const account = accounts.find((a) => a.id === mine.accountId)!;
    const client = options.client !== undefined ? options.client : createRiotClient({ maxRetries: 0, timeoutMs: 7_000 });
    if (!client) {
      if (!row) return { status: "not-configured", message: "The timeline appears once Riot access is configured for this site." };
      eventsNote = EVENTS_NOT_CONFIGURED;
    } else {
      try {
        const timeline = await client.matchTimeline(account.platform, matchId);
        const kept = await keptTimeline(db, timelineRow(matchId, account.platform, timeline));
        // A kept timeline is completed, never replaced: what it holds stays (completedTimeline).
        const done = completedTimeline(row, kept);
        await db.insert(matchTimelines).values({ ...kept, ...done }).onConflictDoUpdate({ target: matchTimelines.matchId, set: done });
      } catch (err) {
        const status = err instanceof RiotApiError ? err.status : 0;
        if (status === 404) {
          // Riot no longer provides it: recorded, so it is not asked for again (a kept timeline keeps what it has).
          if (row) await db.update(matchTimelines).set({ events: { objectives: [], missing: true } }).where(eq(matchTimelines.matchId, matchId));
          else await db.insert(matchTimelines).values(timelineRow(matchId, account.platform, null)).onConflictDoNothing();
        } else if (!row) {
          return status === 429
            ? { status: "error", message: "Riot is limiting requests just now. Open the game again in a minute to load its timeline." }
            : { status: "error", message: "Riot did not answer just now. Open the game again in a moment to load its timeline." };
        } else eventsNote = status === 429 ? EVENTS_BUSY : EVENTS_FAILED;
      }
      [row] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
    }
  }
  if (!row || !row.participants.length) return { status: "unavailable", message: "Riot does not provide the timeline of this game, so its build order and minute-by-minute figures are not shown." };
  return { row, puuids: new Set(accounts.map((a) => a.puuid).filter((x): x is string => !!x)), eventsNote };
}

/** An item's name, icon and kind for one game (its Data Dragon version), from the stored asset maps: one small read for the game's version (the maps are cached). */
async function itemDescriber(db: Db, matchId: string) {
  const [[detail], assets, patch] = await Promise.all([db.select({ gameVersion: matchDetails.gameVersion }).from(matchDetails).where(eq(matchDetails.matchId, matchId)), loadRiotAssets(db), getCurrentPatch(db)]);
  const version = ddragonVersionOf(detail?.gameVersion ?? null, patch?.ddragonVersion ?? null);
  const done = new Set(assets?.itemKinds?.done ?? []);
  const minor = new Set(assets?.itemKinds?.minor ?? []);
  return {
    kinds: !!assets?.itemKinds,
    describe: (id: number) => ({ name: assets?.items[String(id)] ?? `Item ${id}`, url: version ? assetUrl.item(version, id) : null, done: done.has(id), minor: minor.has(id) }),
  };
}

function buildOf(me: MatchTimelineParticipant, describe: (id: number) => { name: string; url: string | null }): MatchBuildView {
  return {
    steps: buildSteps(me.purchases, describe),
    skills: me.skills.map((s) => SLOT[s - 1]!),
    maxOrder: maxOrderOf(me.skills),
  };
}

/** One player's timeline in a game, for the post-game view's inspection of any of its players (by their place in the record). */
export interface TimelinePlayerView {
  /** The player's place in the game's record (DetailParticipant.slot). */
  slot: number;
  /** Purchases and sales in the order they happened (domain/build-path buildPath; undone purchases are not kept), each with its item's name, icon and kind. */
  path: Array<BuildEvent & { done: boolean; minor: boolean }>;
  /** Skill slots in the order taken (1 = Q … 4 = R), Riot's evolve level-ups left out. */
  skills: number[];
  /**
   * Gold and experience at every frame (aligned with the view's `t`): what the final score's lane
   * reads; null when the player's frames have a gap, or the timeline contradicts the record. The
   * kill, death and assist times and the CS at every frame went with the score through the game
   * (25 Nov 2026), the only reader of them in the view; they stay stored.
   */
  frames: { g: number[]; x: number[] } | null;
  /** Against the lane opponent at 10:00 and 15:00 (the one lane opponent rule), as `lane` is for the profile's player. */
  lane: { opponentSlot: number; moments: LaneMoment[] } | null;
  /** The bot lane at 10:00, two against two, as `pair` is for the profile's player. */
  pair: { allySlot: number; opponentSlots: [number, number]; gold: number } | null;
}

export interface MatchTimelineView {
  /** Build and skill order; null when the timeline has no entry for the player. */
  build: MatchBuildView | null;
  /** Every player the stored timeline keeps (a removed player's entry is not kept), by place in the record: what inspecting another player reads, with nothing more fetched. */
  players: TimelinePlayerView[];
  /** The frames' own times in ms (the players' `frames` are aligned with them); null without frames or when the timeline contradicts the record. */
  t: number[] | null;
  /** Whether the timeline keeps sales (timelines kept from 20 Nov 2026 on): without, a build path shows purchases only. */
  sales: boolean;
  /** Whether items can be marked completed or minor (the asset maps' item kinds, format 4 on). */
  itemKinds: boolean;
  /** Each item the players' paths name, once: its name and icon (the paths carry ids, so a name is not sent ten times). */
  items: Record<string, { name: string; url: string | null }>;
  /**
   * The player and the enemy in the same recorded position at 10:00 and 15:00; null without such
   * an enemy (exactly one) or without both players' frames. `opponentSlot` is their place in the record.
   */
  lane: { opponentSlot: number; moments: LaneMoment[] } | null;
  /** The bot lane at 10:00, two against two (domain/match-analysis botPairOf): the partner's and the two enemies' places in the record, and the pair's gold minus theirs; null outside the bot lane or without all four seats clear. */
  pair: { allySlot: number; opponentSlots: [number, number]; gold: number } | null;
  /** The two teams' gold difference at every frame, from the player's side; null unless all ten players' frames are kept. */
  gold: GoldPoint[] | null;
  /** Why `gold` is null when frames exist: "incomplete" (a player's frames are missing) or "contradicts" (the timeline and the record disagree). */
  goldNote: "incomplete" | "contradicts" | null;
  /** The game's last frame, in minutes (the length the curve covers). */
  minutes: number | null;
  /** Kills and objectives along the game (domain/match-events); null when this timeline does not hold them. */
  events: TimelineEventsView | null;
  /** Why the kills and objectives are missing when Riot could not be asked just now. */
  eventsNote: string | null;
}

export type MatchTimelineResult = { status: "ok"; timeline: MatchTimelineView } | TimelineFailure;

const MINUTE = 60_000;

/**
 * The kills and objectives of a stored timeline, from the player's side and in minutes: objectives
 * by the team that took them, every team kill when all ten players' kills are kept (a removed
 * player's are not), and the player's own kills, deaths and assists. Null for a timeline kept
 * before they were, or that Riot no longer provides.
 */
function eventsView(row: TimelineRow, parts: ReadonlyArray<{ puuid: string; teamId: number; removed?: boolean }>, me: { puuid: string; teamId: number } | null): TimelineEventsView | null {
  if (!row.events || row.events.missing || !me) return null;
  const entry = new Map(row.participants.map((p) => [p.puuid, p]));
  const present = parts.filter((p) => !p.removed && p.puuid);
  const complete = parts.length === 10 && present.length === 10 && present.every((p) => entry.get(p.puuid)?.kills);
  const killsOf = (own: boolean) =>
    present
      .filter((p) => (p.teamId === me.teamId) === own)
      .flatMap((p) => entry.get(p.puuid)?.kills ?? [])
      .sort((a, b) => a - b)
      .map((t) => t / MINUTE);
  const mine = entry.get(me.puuid);
  return {
    objectives: row.events.objectives.map((o) => ({ minute: o.t / MINUTE, own: o.team === me.teamId, kind: o.kind, detail: o.detail ?? null })),
    kills: complete ? { own: killsOf(true), enemy: killsOf(false) } : null,
    you: mine?.kills ? { kills: mine.kills.map((t) => t / MINUTE), deaths: (mine.deaths ?? []).map((t) => t / MINUTE), assists: (mine.assists ?? []).map((t) => t / MINUTE) } : null,
  };
}

/** A player's place in a game as a stored timeline is read against it: by place in the record, with Riot's position readings (loadCompositionParticipants with lanes). */
export type TimelineSeat = LaneSeat & { puuid: string };

/**
 * The profile's player's place in the record (the first linked account in it; -1 for none) and the
 * two teams' gold difference at every frame from that side, before the record is checked against
 * it (goldContradictsRecord): null without frames, without the player, or unless all ten players'
 * frames are kept. The opened game's timeline (getMatchTimeline) and the card's score
 * (players/match-history) read this one rule.
 */
export function framesGoldOf<F extends { g: readonly number[] }>(parts: readonly TimelineSeat[], frames: { t: readonly number[]; p: Readonly<Record<string, F>> } | null, own: ReadonlySet<string>): { meSlot: number; gold: GoldPoint[] | null } {
  const meSlot = parts.findIndex((p) => own.has(p.puuid));
  const me = meSlot >= 0 ? parts[meSlot]! : null;
  const series = frames ? parts.filter((p) => !p.removed && frames.p[p.puuid]).map((p) => ({ teamId: p.teamId, g: frames.p[p.puuid]!.g })) : [];
  return { meSlot, gold: frames && me ? teamGoldDifference(frames.t, series, me.teamId) : null };
}

/**
 * Each player's frames in the frames a view may read (null when the timeline contradicts the
 * record), and their lane opponent's (the one lane opponent rule), by place in the record. A
 * player's lane is confirmed where both are there. The opened game's per-player timeline and the
 * card's score read this one rule.
 */
export function framesBySeat<F>(parts: readonly TimelineSeat[], usable: { p: Readonly<Record<string, F>> } | null): Array<{ frames: F | null; opponentSlot: number | null; opponentFrames: F | null }> {
  return parts.map((p, slot) => {
    const opponentSlot = laneOpponentOf(parts, slot);
    return {
      frames: (!p.removed && p.puuid ? usable?.p[p.puuid] : undefined) ?? null,
      opponentSlot,
      opponentFrames: (opponentSlot !== null && usable ? usable.p[parts[opponentSlot]!.puuid] : undefined) ?? null,
    };
  });
}

/**
 * The teams' recorded gold from one side, from the stored record's players: recordedGoldDifference
 * below, read from a record already loaded (Match History's page reads its games' records whole).
 * Null when a player's gold is not recorded or a player is removed, or without players.
 */
export function recordedGoldDifferenceOf(participants: ReadonlyArray<{ teamId: number; gold: number | null; removed?: boolean }>, teamId: number): number | null {
  if (!participants.length || !participants.every((p) => typeof p.gold === "number" && p.removed !== true)) return null;
  return participants.reduce((n, p) => n + (p.teamId === teamId ? p.gold! : -p.gold!), 0);
}

/**
 * What the final performance score reads of a stored timeline (domain/performance-inputs
 * ScoreTimeline), from the same rules as getMatchTimeline: the frames' times, and for each player
 * the timeline keeps (`kept`: its participants' PUUIDs), their gold and experience at every frame
 * and whether their lane is confirmed. Nothing of the frames when the timeline contradicts the
 * record. `recordedDiff` is the record's gold difference from a side (recordedGoldDifferenceOf).
 */
export function scoreTimelineOf<F extends { g: readonly number[]; x: readonly number[] }>(parts: readonly TimelineSeat[], stored: { t: readonly number[]; p: Readonly<Record<string, F>> } | null | undefined, kept: ReadonlySet<string>, own: ReadonlySet<string>, recordedDiff: (teamId: number) => number | null): ScoreTimeline {
  const frames = stored && stored.t.length ? stored : null;
  const { meSlot, gold } = framesGoldOf(parts, frames, own);
  const contradicts = !!gold && meSlot >= 0 && goldContradictsRecord(gold, recordedDiff(parts[meSlot]!.teamId));
  const usable = frames && !contradicts ? frames : null;
  const seats = framesBySeat(parts, usable);
  return {
    t: usable ? usable.t : null,
    players: parts.flatMap((p, slot) => {
      if (p.removed || !p.puuid || !kept.has(p.puuid)) return [];
      const { frames: f, opponentSlot, opponentFrames } = seats[slot]!;
      return [{ slot, frames: f ? { g: f.g, x: f.x } : null, lane: f && opponentFrames && opponentSlot !== null ? { opponentSlot } : null }];
    }),
  };
}

/** What a card's score reads of one game's stored timeline (loadScoreTimelines). */
export interface StoredScoreTimeline {
  /** The timeline keeps players (empty: Riot no longer provides it). */
  available: boolean;
  /** Kept before the kills and objectives were (29 Oct 2026): opening the game fetches it again once. */
  dated: boolean;
  /** The frames' times; null when no frames are stored. */
  t: number[] | null;
  /**
   * By place in the game's stored record: whether the timeline keeps that player, and their gold and
   * experience at every frame (null when the frames hold none for them). Not their CS, positions,
   * purchases or anything else.
   */
  seats: Array<{ kept: boolean; frames: { g: number[]; x: number[] } | null }>;
}

/**
 * The stored timelines of a page's games, trimmed in the database to what the final score reads:
 * whether each keeps players, whether it is dated, the frames' times, and for each player of the
 * game's record (by place, so no PUUID is sent) whether the timeline keeps them and their gold and
 * experience at every frame. One query for the page (at most PER_PAGE_MAX games); a game without a
 * stored timeline has no entry.
 */
export async function loadScoreTimelines(db: Db, matchIds: readonly string[]): Promise<Map<string, StoredScoreTimeline>> {
  const ids = [...new Set(matchIds)];
  const out = new Map<string, StoredScoreTimeline>();
  if (!ids.length) return out;
  const result = await db.execute(sql`
    SELECT t.match_id,
           jsonb_array_length(t.participants) > 0 AS available,
           t.events IS NULL AS dated,
           t.frames->'t' AS t,
           (SELECT jsonb_agg(jsonb_build_array(
                     t.participants @> jsonb_build_array(jsonb_build_object('puuid', s.p->>'puuid')),
                     t.frames->'p'->(s.p->>'puuid')->'g',
                     t.frames->'p'->(s.p->>'puuid')->'x') ORDER BY s.ord)
            FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) WITH ORDINALITY AS s(p, ord)
            WHERE d.match_id = t.match_id) AS seats
    FROM match_timelines t
    WHERE t.match_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  const json = <T,>(v: unknown): T | null => (v === null || v === undefined ? null : ((typeof v === "string" ? JSON.parse(v) : v) as T));
  const yes = (v: unknown) => v === true || v === "t" || v === "true";
  const rows = ((result as { rows?: unknown[] }).rows ?? result) as Array<{ match_id: string; available: unknown; dated: unknown; t: unknown; seats: unknown }>;
  for (const r of rows) {
    const t = json<number[]>(r.t);
    const seats = json<Array<[boolean, number[] | null, number[] | null]>>(r.seats) ?? [];
    out.set(r.match_id, {
      available: yes(r.available),
      dated: yes(r.dated),
      t: Array.isArray(t) ? t : null,
      seats: seats.map(([kept, g, x]) => ({ kept: kept === true, frames: Array.isArray(g) && Array.isArray(x) ? { g, x } : null })),
    });
  }
  return out;
}

/**
 * A trimmed timeline (loadScoreTimelines) as the shared rules read it: the frames by PUUID and the
 * PUUIDs it keeps, from the record's players in their places. Places beyond the record (none in
 * practice) are left out.
 */
export function scoreFramesOf(stored: StoredScoreTimeline, participants: ReadonlyArray<{ puuid: string }>): { frames: { t: number[]; p: Record<string, { g: number[]; x: number[] }> } | null; kept: Set<string> } {
  const p: Record<string, { g: number[]; x: number[] }> = {};
  const kept = new Set<string>();
  stored.seats.forEach((seat, slot) => {
    const puuid = participants[slot]?.puuid;
    if (!puuid) return;
    if (seat.kept) kept.add(puuid);
    if (seat.frames) p[puuid] = seat.frames;
  });
  return { frames: stored.t ? { t: stored.t, p } : null, kept };
}

/** The teams' recorded gold (Riot's goldEarned) from one side; null when a player's is not recorded. One row by primary key. */
async function recordedGoldDifference(db: Db, matchId: string, teamId: number): Promise<number | null> {
  const result = await db.execute(sql`
    SELECT CASE WHEN bool_and(p->>'gold' IS NOT NULL AND coalesce(p->>'removed', '') <> 'true')
      THEN sum(CASE WHEN (p->>'teamId')::int = ${teamId} THEN (p->>'gold')::numeric ELSE -(p->>'gold')::numeric END) END AS diff
    FROM match_details d CROSS JOIN LATERAL jsonb_array_elements(d.participants) p
    WHERE d.match_id = ${matchId}`);
  const [row] = ((result as { rows?: unknown[] }).rows ?? result) as Array<{ diff: string | number | null }>;
  return row?.diff === null || row?.diff === undefined ? null : Number(row.diff);
}

/**
 * Everything a match's breakdown reads from its timeline, in one request: the build, the lane at
 * fixed minutes, the gold difference over the game and the kills and objectives along it. Stored
 * data first; fetched from Riot at most once per match, when someone opens it.
 */
export async function getMatchTimeline(db: Db, playerId: string, matchId: string, options: { fetch?: boolean; client?: RiotApiClient | null } = {}): Promise<MatchTimelineResult> {
  const found = await timelineFor(db, playerId, matchId, options);
  if ("status" in found) return found;
  const { row, puuids, eventsNote } = found;
  const meTimeline = row.participants.find((p) => puuids.has(p.puuid)) ?? null;
  // With Riot's two readings of each position: the lane is found by the one lane opponent rule.
  const parts = (await loadCompositionParticipants(db, [matchId], { lanes: true })).get(matchId) ?? [];
  const frames = row.frames && row.frames.t.length ? row.frames : null;
  // The profile's player and the teams' gold difference (framesGoldOf: the card's score reads the same rule).
  const { meSlot, gold: goldRead } = framesGoldOf(parts, frames, puuids);
  const me = meSlot >= 0 ? parts[meSlot]! : null;
  // A timeline that tells a different game from the record (one side clearly ahead in one, clearly
  // behind in the other) is not drawn, and neither is its lane: the record is what every other view reads.
  const contradicts = !!goldRead && !!me && goldContradictsRecord(goldRead, await recordedGoldDifference(db, matchId, me.teamId));
  const gold = contradicts ? null : goldRead;
  const usable = frames && !contradicts ? frames : null;
  // Every player's frames and their lane opponent's, by the one lane opponent rule (framesBySeat).
  const seats = framesBySeat(parts, usable);
  let lane: MatchTimelineView["lane"] = null;
  if (usable && me) {
    const { frames: mine, opponentSlot, opponentFrames: theirs } = seats[meSlot]!;
    if (mine && theirs && opponentSlot !== null) lane = { opponentSlot, moments: laneMoments(usable.t, mine, theirs, LANE_MINUTES) };
  }
  let pair: MatchTimelineView["pair"] = null;
  const mySeats = me ? botPairOf(parts, meSlot) : null;
  if (usable && me && mySeats) {
    const f = (slot: number) => usable.p[parts[slot]!.puuid];
    const [a, b, c, d] = [f(meSlot), f(mySeats.ally), f(mySeats.opponents[0]), f(mySeats.opponents[1])];
    const pairGold = a && b && c && d ? pairMoments(usable.t, [a, b], [c, d], 10) : null;
    if (pairGold !== null) pair = { allySlot: mySeats.ally, opponentSlots: mySeats.opponents, gold: pairGold };
  }
  // Every player's own: the same rules as the profile's player's above, from the row already read.
  const { describe, kinds } = await itemDescriber(db, matchId);
  const entry = new Map(row.participants.map((p) => [p.puuid, p]));
  const items: MatchTimelineView["items"] = {};
  const players: TimelinePlayerView[] = parts.flatMap((p, slot) => {
    const e = !p.removed && p.puuid ? entry.get(p.puuid) : undefined;
    if (!e) return [];
    const { frames: f, opponentSlot: opp, opponentFrames: theirs } = seats[slot]!;
    const pairSeats = usable ? botPairOf(parts, slot) : null;
    const seat = (s: number) => usable?.p[parts[s]!.puuid];
    const [ally, o1, o2] = pairSeats ? [seat(pairSeats.ally), seat(pairSeats.opponents[0]), seat(pairSeats.opponents[1])] : [];
    const pairGold = pairSeats && f && ally && o1 && o2 ? pairMoments(usable!.t, [f, ally], [o1, o2], 10) : null;
    return [
      {
        slot,
        path: buildPath(e.purchases, e.sold ?? []).map((x) => {
          const d = describe(x.id);
          items[String(x.id)] ??= { name: d.name, url: d.url };
          return { ...x, done: d.done, minor: d.minor };
        }),
        skills: e.skills,
        frames: f ? { g: f.g, x: f.x } : null,
        lane: f && theirs && opp !== null ? { opponentSlot: opp, moments: laneMoments(usable!.t, f, theirs, LANE_MINUTES) } : null,
        pair: pairSeats && pairGold !== null ? { allySlot: pairSeats.ally, opponentSlots: pairSeats.opponents, gold: pairGold } : null,
      },
    ];
  });
  return {
    status: "ok",
    timeline: {
      build: meTimeline ? buildOf(meTimeline, describe) : null,
      players,
      t: usable ? usable.t : null,
      // Sales are kept with the turret plates (20 Nov 2026 on): an older timeline never had them.
      sales: !!row.events?.plates,
      itemKinds: kinds,
      items,
      lane,
      pair,
      gold,
      goldNote: contradicts ? "contradicts" : frames && !gold ? "incomplete" : null,
      minutes: frames ? frames.t[frames.t.length - 1]! / MINUTE : null,
      events: eventsView(row, parts, me),
      eventsNote: row.events ? null : eventsNote,
    },
  };
}
