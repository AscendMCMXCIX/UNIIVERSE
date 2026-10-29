import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, matchTimelines, type MatchEvents, type MatchFrames, type MatchObjectiveEvent, type MatchTimelineParticipant } from "@/server/db/schema";
import type { RiotMatchTimeline } from "@/server/riot/api/schemas";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { assetUrl, ddragonVersionOf, loadRiotAssets } from "@/server/riot/static/assets";
import { getCurrentPatch } from "@/server/repositories/champions";
import { erasureFilter } from "@/server/privacy/ledger";
import { redactTimeline } from "@/server/privacy/redact";
import { loadCompositionParticipants } from "@/server/matches/compositions";
import { LANE_MINUTES, laneMoments, laneOpponentOf, teamGoldDifference, type GoldPoint, type LaneMoment } from "@/domain/match-analysis";
import type { TimelineEventsView } from "@/domain/match-events";

/*
  One match minute by minute, from Riot's match timeline: the build and skill order, the lane at
  10:00 and 15:00, the two teams' gold difference over the game, and the kills and objectives along
  it. The timeline is a separate request Riot makes per match, so it is never fetched while a page
  renders or during the account sync: it is fetched once, when a player first opens that match's
  breakdown or when the timeline backfill reaches it, and kept compactly: the purchases and skill
  level-ups, when each player took part in a champion kill, each player's gold, experience and CS
  at every frame (nothing else of the frames), and the objectives and buildings each team took.
  Timelines kept before the kills and objectives were (29 Oct 2026) are fetched again once, the
  next time someone opens their Timeline. Nothing is reconstructed from the final inventory or the
  final figures: without a timeline the page says so.
*/

/** Each player's gold, experience and CS at every frame, aligned with the frames' own timestamps. */
export function timelineFrames(t: RiotMatchTimeline): MatchFrames {
  const puuidOf = new Map<number, string>(t.info.participants.map((p) => [p.participantId, p.puuid]));
  if (!puuidOf.size) t.metadata.participants.forEach((puuid, i) => puuidOf.set(i + 1, puuid));
  const frames = t.info.frames.filter((f) => typeof f.timestamp === "number" && f.participantFrames && Object.keys(f.participantFrames).length);
  // Frames come in order; sorted anyway so interpolation can rely on it.
  frames.sort((a, b) => a.timestamp! - b.timestamp!);
  const out: MatchFrames = { t: frames.map((f) => f.timestamp!), p: {} };
  for (const [id, puuid] of puuidOf) {
    const row = { g: [] as number[], x: [] as number[], c: [] as number[] };
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
    }
    // A player with a gap in the frames is left out rather than given invented values.
    if (complete && frames.length) out.p[puuid] = row;
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
 * the Elder Dragon, Baron, the Rift Herald, voidgrubs, Atakhan), towers and inhibitors. Team facts
 * only: who took part is not kept here. Riot names the side that lost a building; the other side took it.
 */
export function timelineEvents(t: RiotMatchTimeline): MatchEvents {
  // Riot's participants 1 to 5 play on the blue side (100), 6 to 10 on the red side (200).
  const sideOf = (participantId: number | undefined) => (participantId && participantId >= 1 && participantId <= 10 ? (participantId <= 5 ? 100 : 200) : null);
  const objectives: MatchObjectiveEvent[] = [];
  for (const e of t.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp)) {
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
  return { objectives };
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
 * (kill, death and assist times, frames, the objectives). Both have been through keptTimeline, so a
 * player erased since appears in neither. A timeline Riot no longer provides keeps everything kept.
 */
export function completedTimeline(stored: Pick<TimelineRow, "participants" | "frames" | "events"> | undefined, fresh: typeof matchTimelines.$inferInsert): Pick<typeof matchTimelines.$inferInsert, "participants" | "frames" | "events"> {
  if (!stored) return { participants: fresh.participants, frames: fresh.frames, events: fresh.events };
  const answer = new Map(fresh.participants.map((p) => [p.puuid, p]));
  const kept = new Set(stored.participants.map((p) => p.puuid));
  const participants = stored.participants.length
    ? [
        ...stored.participants.map((p) => {
          const f = answer.get(p.puuid);
          return {
            ...p,
            purchases: p.purchases.length ? p.purchases : (f?.purchases ?? []),
            skills: p.skills.length ? p.skills : (f?.skills ?? []),
            ...((p.kills ?? f?.kills) ? { kills: p.kills ?? f!.kills } : {}),
            ...((p.deaths ?? f?.deaths) ? { deaths: p.deaths ?? f!.deaths } : {}),
            ...((p.assists ?? f?.assists) ? { assists: p.assists ?? f!.assists } : {}),
          };
        }),
        ...fresh.participants.filter((p) => !kept.has(p.puuid)),
      ]
    : fresh.participants;
  return {
    participants,
    frames: stored.frames && stored.frames.t.length ? stored.frames : fresh.frames,
    events: stored.events && !stored.events.missing ? stored.events : (fresh.events ?? stored.events),
  };
}

/** Purchases (undone ones removed), skill level-ups and the champion kills each player took part in, from a Riot timeline. */
export function timelineParticipants(t: RiotMatchTimeline): MatchTimelineParticipant[] {
  const puuidOf = new Map<number, string>(t.info.participants.map((p) => [p.participantId, p.puuid]));
  // Older timelines leave info.participants empty: participant n is the n-th of metadata.participants.
  if (!puuidOf.size) t.metadata.participants.forEach((puuid, i) => puuidOf.set(i + 1, puuid));
  const by = new Map<number, Required<MatchTimelineParticipant>>();
  for (const [id, puuid] of puuidOf) by.set(id, { puuid, purchases: [], skills: [], kills: [], deaths: [], assists: [] });
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
    else if (e.type === "ITEM_UNDO" && e.beforeId) {
      // An undone purchase: drop the latest purchase of that item.
      for (let i = p.purchases.length - 1; i >= 0; i--)
        if (p.purchases[i]![1] === e.beforeId) {
          p.purchases.splice(i, 1);
          break;
        }
    } else if (e.type === "SKILL_LEVEL_UP" && e.levelUpType !== "EVOLVE" && e.skillSlot && e.skillSlot >= 1 && e.skillSlot <= 4) p.skills.push(e.skillSlot);
  }
  return [...by.values()];
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

async function buildOf(db: Db, matchId: string, me: MatchTimelineParticipant): Promise<MatchBuildView> {
  const [[detail], assets, patch] = await Promise.all([db.select({ gameVersion: matchDetails.gameVersion }).from(matchDetails).where(eq(matchDetails.matchId, matchId)), loadRiotAssets(db), getCurrentPatch(db)]);
  const version = ddragonVersionOf(detail?.gameVersion ?? null, patch?.ddragonVersion ?? null);
  const describe = (id: number) => ({ name: assets?.items[String(id)] ?? `Item ${id}`, url: version ? assetUrl.item(version, id) : null });
  return {
    steps: buildSteps(me.purchases, describe),
    skills: me.skills.map((s) => SLOT[s - 1]!),
    maxOrder: maxOrderOf(me.skills),
  };
}

export interface MatchTimelineView {
  /** Build and skill order; null when the timeline has no entry for the player. */
  build: MatchBuildView | null;
  /**
   * The player and the enemy in the same recorded position at 10:00 and 15:00; null without such
   * an enemy (exactly one) or without both players' frames. `opponentSlot` is their place in the record.
   */
  lane: { opponentSlot: number; moments: LaneMoment[] } | null;
  /** The two teams' gold difference at every frame, from the player's side; null unless all ten players' frames are kept. */
  gold: GoldPoint[] | null;
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
  const parts = (await loadCompositionParticipants(db, [matchId])).get(matchId) ?? [];
  const meSlot = parts.findIndex((p) => puuids.has(p.puuid));
  const me = meSlot >= 0 ? parts[meSlot]! : null;
  const frames = row.frames && row.frames.t.length ? row.frames : null;
  let lane: MatchTimelineView["lane"] = null;
  const opponentSlot = me ? laneOpponentOf(parts, meSlot) : null;
  if (frames && me && opponentSlot !== null) {
    const mine = frames.p[me.puuid];
    const theirs = frames.p[parts[opponentSlot]!.puuid];
    if (mine && theirs) lane = { opponentSlot, moments: laneMoments(frames.t, mine, theirs, LANE_MINUTES) };
  }
  const series = frames ? parts.filter((p) => !p.removed && frames.p[p.puuid]).map((p) => ({ teamId: p.teamId, g: frames.p[p.puuid]!.g })) : [];
  return {
    status: "ok",
    timeline: {
      build: meTimeline ? await buildOf(db, matchId, meTimeline) : null,
      lane,
      gold: frames && me ? teamGoldDifference(frames.t, series, me.teamId) : null,
      minutes: frames ? frames.t[frames.t.length - 1]! / MINUTE : null,
      events: eventsView(row, parts, me),
      eventsNote: row.events ? null : eventsNote,
    },
  };
}
