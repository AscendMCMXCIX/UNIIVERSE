import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, matchDetails, matchTimelines, type MatchFrames, type MatchTimelineParticipant } from "@/server/db/schema";
import type { RiotMatchTimeline } from "@/server/riot/api/schemas";
import { listAccountsForPlayer } from "@/server/accounts/repository";
import { createRiotClient, RiotApiError, type RiotApiClient } from "@/server/riot/api/client";
import { assetUrl, ddragonVersionOf, loadRiotAssets } from "@/server/riot/static/assets";
import { getCurrentPatch } from "@/server/repositories/champions";
import { erasureFilter } from "@/server/privacy/ledger";
import { redactTimeline } from "@/server/privacy/redact";
import { loadCompositionParticipants } from "@/server/matches/compositions";
import { LANE_MINUTES, laneMoments, laneOpponentOf, teamGoldDifference, type GoldPoint, type LaneMoment } from "@/domain/match-analysis";

/*
  One match minute by minute, from Riot's match timeline: the build and skill order, the lane at
  10:00 and 15:00 and the two teams' gold difference over the game. The timeline is a separate
  request Riot makes per match, so it is never fetched while a page renders or during the account
  sync: it is fetched once, when a player first opens that match's breakdown or when the timeline
  backfill reaches it, and kept compactly: the purchases and skill level-ups, and each player's gold,
  experience and CS at every frame (nothing else of the frames). Nothing is reconstructed from the
  final inventory or the final figures: without a timeline the page says so.
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
  return timeline ? { matchId, platform, participants: timelineParticipants(timeline), frames: timelineFrames(timeline) } : { matchId, platform, participants: [], frames: { t: [], p: {} } };
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

/** Purchases (undone ones removed) and skill level-ups per player, from a Riot timeline. */
export function timelineParticipants(t: RiotMatchTimeline): MatchTimelineParticipant[] {
  const puuidOf = new Map<number, string>(t.info.participants.map((p) => [p.participantId, p.puuid]));
  // Older timelines leave info.participants empty: participant n is the n-th of metadata.participants.
  if (!puuidOf.size) t.metadata.participants.forEach((puuid, i) => puuidOf.set(i + 1, puuid));
  const by = new Map<number, MatchTimelineParticipant>();
  for (const [id, puuid] of puuidOf) by.set(id, { puuid, purchases: [], skills: [] });
  const events = t.info.frames.flatMap((f) => f.events).sort((a, b) => a.timestamp - b.timestamp);
  for (const e of events) {
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

/**
 * One of the player's stored games and its timeline: read from storage, or fetched from Riot once
 * and kept (one request, at most once per match, only when someone opens it). A failure says why.
 */
async function timelineFor(db: Db, playerId: string, matchId: string, options: { fetch?: boolean; client?: RiotApiClient | null }): Promise<{ row: TimelineRow; puuids: Set<string> } | TimelineFailure> {
  const accounts = await listAccountsForPlayer(db, playerId);
  if (!accounts.length) return { status: "not-found", message: "This match is not in this player's history." };
  const [mine] = await db
    .select({ accountId: accountMatches.accountId })
    .from(accountMatches)
    .where(and(eq(accountMatches.matchId, matchId), inArray(accountMatches.accountId, accounts.map((a) => a.id)), isNotNull(accountMatches.championId)));
  if (!mine) return { status: "not-found", message: "This match is not in this player's history." };
  let [row] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
  if (!row && options.fetch) {
    const account = accounts.find((a) => a.id === mine.accountId)!;
    const client = options.client !== undefined ? options.client : createRiotClient({ maxRetries: 0, timeoutMs: 7_000 });
    if (!client) return { status: "not-configured", message: "The timeline appears once Riot access is configured for this site." };
    try {
      const timeline = await client.matchTimeline(account.platform, matchId);
      await db.insert(matchTimelines).values(await keptTimeline(db, timelineRow(matchId, account.platform, timeline))).onConflictDoNothing();
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) await db.insert(matchTimelines).values(timelineRow(matchId, account.platform, null)).onConflictDoNothing();
      else if (err instanceof RiotApiError && err.status === 429) return { status: "error", message: "Riot is limiting requests just now. Open the game again in a minute to load its timeline." };
      else return { status: "error", message: "Riot did not answer just now. Open the game again in a moment to load its timeline." };
    }
    [row] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
  }
  if (!row || !row.participants.length) return { status: "unavailable", message: "Riot does not provide the timeline of this game, so its build order and minute-by-minute figures are not shown." };
  return { row, puuids: new Set(accounts.map((a) => a.puuid).filter((x): x is string => !!x)) };
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
}

export type MatchTimelineResult = { status: "ok"; timeline: MatchTimelineView } | TimelineFailure;

/**
 * Everything a match's breakdown reads from its timeline, in one request: the build, the lane at
 * fixed minutes and the gold difference over the game. Stored data first; fetched from Riot at most
 * once per match, when someone opens it.
 */
export async function getMatchTimeline(db: Db, playerId: string, matchId: string, options: { fetch?: boolean; client?: RiotApiClient | null } = {}): Promise<MatchTimelineResult> {
  const found = await timelineFor(db, playerId, matchId, options);
  if ("status" in found) return found;
  const { row, puuids } = found;
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
      minutes: frames ? frames.t[frames.t.length - 1]! / 60_000 : null,
    },
  };
}
