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

/*
  Build order and skill order for one match, from Riot's match timeline. The timeline is a separate
  request Riot makes per match, so it is never fetched while a page renders or during the account
  sync: it is fetched once, when a player first opens that match's details or when the timeline
  backfill reaches it, and kept compactly: the purchases, skill level-ups and death times, and each
  player's gold, experience and CS at every frame (for Matchups; nothing else of the frames). Nothing is
  reconstructed from the final inventory: without a timeline the page says so.
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

/** Purchases (undone ones removed), skill level-ups and death times per player, from a Riot timeline. */
export function timelineParticipants(t: RiotMatchTimeline): MatchTimelineParticipant[] {
  const puuidOf = new Map<number, string>(t.info.participants.map((p) => [p.participantId, p.puuid]));
  // Older timelines leave info.participants empty: participant n is the n-th of metadata.participants.
  if (!puuidOf.size) t.metadata.participants.forEach((puuid, i) => puuidOf.set(i + 1, puuid));
  const by = new Map<number, MatchTimelineParticipant>();
  for (const [id, puuid] of puuidOf) by.set(id, { puuid, purchases: [], skills: [], deaths: [] });
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
  // Deaths, for Ranked Development's laning-phase statistic: the victim of each champion kill.
  for (const e of events) if (e.type === "CHAMPION_KILL" && e.victimId !== undefined) by.get(e.victimId)?.deaths?.push(e.timestamp);
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

export type MatchBuildResult = { status: "ok"; build: MatchBuildView } | { status: "unavailable" | "not-configured" | "not-found" | "error"; message: string };

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

/**
 * The player's build and skill order in one of their stored games. The match must be one of the
 * player's stored games. The timeline is read from storage, or fetched from Riot once and kept
 * (one request, at most once per match, only when someone opens it).
 */
export async function getMatchBuild(db: Db, playerId: string, matchId: string, options: { fetch?: boolean; client?: RiotApiClient | null } = {}): Promise<MatchBuildResult> {
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
    if (!client) return { status: "not-configured", message: "The build order appears once Riot access is configured for this site." };
    try {
      const timeline = await client.matchTimeline(account.platform, matchId);
      await db.insert(matchTimelines).values(await keptTimeline(db, timelineRow(matchId, account.platform, timeline))).onConflictDoNothing();
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) await db.insert(matchTimelines).values(timelineRow(matchId, account.platform, null)).onConflictDoNothing();
      else return { status: "error", message: "Riot did not answer just now. Open the game again in a moment to load its build order." };
    }
    [row] = await db.select().from(matchTimelines).where(eq(matchTimelines.matchId, matchId));
  }
  if (!row || !row.participants.length) return { status: "unavailable", message: "Riot does not provide the purchase timeline for this game, so its build order is not shown." };
  const puuids = new Set(accounts.map((a) => a.puuid).filter(Boolean));
  const me = row.participants.find((p) => puuids.has(p.puuid));
  if (!me) return { status: "unavailable", message: "This player is not in the stored timeline of this game." };
  const [[detail], assets, patch] = await Promise.all([db.select({ gameVersion: matchDetails.gameVersion }).from(matchDetails).where(eq(matchDetails.matchId, matchId)), loadRiotAssets(db), getCurrentPatch(db)]);
  const version = ddragonVersionOf(detail?.gameVersion ?? null, patch?.ddragonVersion ?? null);
  const describe = (id: number) => ({ name: assets?.items[String(id)] ?? `Item ${id}`, url: version ? assetUrl.item(version, id) : null });
  return {
    status: "ok",
    build: {
      steps: buildSteps(me.purchases, describe),
      skills: me.skills.map((s) => SLOT[s - 1]!),
      maxOrder: maxOrderOf(me.skills),
    },
  };
}
