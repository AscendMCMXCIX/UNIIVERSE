import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { accountMatches, players, rankedBlocks, rankedGames, rankedProfiles, riotAccounts } from "@/server/db/schema";
import { BLOCK_SIZE, blockLabel, championPerformance, cleanLink, isGameResult, isMainMistake, matchupRecords, mistakeCounts, summariseGames, type ChampionPerformance, type JournalDashboard, type MainMistake, type MatchupRecord } from "@/domain/ranked-improvement";
import type { Role } from "@/domain/roles";
import { ROLES } from "@/domain/roles";

/*
  Every function takes the OWNER's player id first and filters by it. There is no way to read or
  change another player's journal through this module: a wrong id simply finds nothing. The
  actions layer derives the owner from the signed-in session, never from input.
*/

export class JournalError extends Error {}

export interface RankedProfileView {
  playerId: string;
  champion1: string | null;
  champion2: string | null;
  champion3: string | null;
  counterPick: string | null;
  focus: string;
}

export interface RankedGameView {
  id: string;
  blockId: string;
  accountId: string | null;
  riotMatchId: string | null;
  playedAt: Date;
  role: Role | null;
  championId: string;
  enemyChampionId: string | null;
  result: "win" | "loss";
  mainMistake: MainMistake | null;
  notes: string;
  link: string;
  teammatePlayerId: string | null;
}

export interface RankedBlockView {
  id: string;
  number: number;
  label: string;
  status: "active" | "completed";
  startedAt: Date;
  completedAt: Date | null;
  games: number;
  wins: number;
  losses: number;
}

function toGame(row: typeof rankedGames.$inferSelect): RankedGameView {
  return {
    id: row.id,
    blockId: row.blockId,
    accountId: row.accountId,
    riotMatchId: row.riotMatchId,
    playedAt: row.playedAt,
    role: row.role,
    championId: row.championId,
    enemyChampionId: row.enemyChampionId,
    result: row.result === "win" ? "win" : "loss",
    mainMistake: isMainMistake(row.mainMistake) ? row.mainMistake : null,
    notes: row.notes,
    link: row.link,
    teammatePlayerId: row.teammatePlayerId,
  };
}

export async function getRankedProfile(db: Db, ownerPlayerId: string): Promise<RankedProfileView> {
  const [row] = await db.select().from(rankedProfiles).where(eq(rankedProfiles.playerId, ownerPlayerId));
  return { playerId: ownerPlayerId, champion1: row?.champion1 ?? null, champion2: row?.champion2 ?? null, champion3: row?.champion3 ?? null, counterPick: row?.counterPick ?? null, focus: row?.focus ?? "" };
}

export async function updateRankedProfile(db: Db, ownerPlayerId: string, patch: Partial<Omit<RankedProfileView, "playerId">>): Promise<RankedProfileView> {
  const values = { ...patch, focus: patch.focus !== undefined ? patch.focus.trim().slice(0, 200) : undefined };
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  await db
    .insert(rankedProfiles)
    .values({ playerId: ownerPlayerId, ...clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: rankedProfiles.playerId, set: { ...clean, updatedAt: new Date() } });
  return getRankedProfile(db, ownerPlayerId);
}

async function blockViews(db: Db, ownerPlayerId: string, rows: Array<typeof rankedBlocks.$inferSelect>): Promise<RankedBlockView[]> {
  if (rows.length === 0) return [];
  const counts = await db
    .select({ blockId: rankedGames.blockId, games: sql<number>`count(*)`, wins: sql<number>`count(*) filter (where ${rankedGames.result} = 'win')` })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), inArray(rankedGames.blockId, rows.map((r) => r.id))))
    .groupBy(rankedGames.blockId);
  const by = new Map(counts.map((c) => [c.blockId, { games: Number(c.games), wins: Number(c.wins) }]));
  return rows.map((r) => {
    const c = by.get(r.id) ?? { games: 0, wins: 0 };
    return { id: r.id, number: r.number, label: blockLabel(r.number), status: r.status === "completed" ? "completed" : "active", startedAt: r.startedAt, completedAt: r.completedAt, games: c.games, wins: c.wins, losses: c.games - c.wins };
  });
}

/** The one active block, or null. */
export async function getActiveBlock(db: Db, ownerPlayerId: string): Promise<RankedBlockView | null> {
  const [row] = await db.select().from(rankedBlocks).where(and(eq(rankedBlocks.playerId, ownerPlayerId), eq(rankedBlocks.status, "active"))).orderBy(desc(rankedBlocks.number)).limit(1);
  return row ? (await blockViews(db, ownerPlayerId, [row]))[0]! : null;
}

/** Starts the next block, or returns the active one: there is never more than one. */
export async function startBlock(db: Db, ownerPlayerId: string): Promise<RankedBlockView> {
  const active = await getActiveBlock(db, ownerPlayerId);
  if (active) return active;
  const [last] = await db.select({ number: sql<number>`coalesce(max(${rankedBlocks.number}), 0)` }).from(rankedBlocks).where(eq(rankedBlocks.playerId, ownerPlayerId));
  const number = Number(last?.number ?? 0) + 1;
  const [row] = await db.insert(rankedBlocks).values({ playerId: ownerPlayerId, number, status: "active" }).returning();
  return (await blockViews(db, ownerPlayerId, [row!]))[0]!;
}

/** Finishes the block at its actual size; an empty block cannot be finished. */
export async function finishBlock(db: Db, ownerPlayerId: string, blockId: string): Promise<RankedBlockView> {
  const [row] = await db.select().from(rankedBlocks).where(and(eq(rankedBlocks.id, blockId), eq(rankedBlocks.playerId, ownerPlayerId)));
  if (!row) throw new JournalError("Block not found.");
  const [view] = await blockViews(db, ownerPlayerId, [row]);
  if (view!.games === 0) throw new JournalError("Add a game before finishing the block.");
  const completedAt = row.completedAt ?? new Date();
  if (row.status !== "completed") await db.update(rankedBlocks).set({ status: "completed", completedAt, updatedAt: new Date() }).where(eq(rankedBlocks.id, row.id));
  return (await blockViews(db, ownerPlayerId, [{ ...row, status: "completed", completedAt }]))[0]!;
}

export async function listBlocks(db: Db, ownerPlayerId: string, options: { limit?: number; offset?: number } = {}): Promise<RankedBlockView[]> {
  const rows = await db
    .select()
    .from(rankedBlocks)
    .where(eq(rankedBlocks.playerId, ownerPlayerId))
    .orderBy(desc(rankedBlocks.number))
    .limit(options.limit ?? 20)
    .offset(options.offset ?? 0);
  return blockViews(db, ownerPlayerId, rows);
}

export async function getBlock(db: Db, ownerPlayerId: string, blockId: string): Promise<{ block: RankedBlockView; games: RankedGameView[] } | null> {
  const [row] = await db.select().from(rankedBlocks).where(and(eq(rankedBlocks.id, blockId), eq(rankedBlocks.playerId, ownerPlayerId)));
  if (!row) return null;
  const [block] = await blockViews(db, ownerPlayerId, [row]);
  const games = await db.select().from(rankedGames).where(and(eq(rankedGames.blockId, row.id), eq(rankedGames.playerId, ownerPlayerId))).orderBy(rankedGames.playedAt, rankedGames.createdAt);
  return { block: block!, games: games.map(toGame) };
}

export interface GameInput {
  championId: string;
  enemyChampionId?: string | null;
  result: "win" | "loss";
  mainMistake?: string | null;
  notes?: string;
  link?: string;
  role?: Role | null;
  playedAt?: Date | null;
  teammatePlayerId?: string | null;
  accountId?: string | null;
  riotMatchId?: string | null;
}

type GameValues = Omit<typeof rankedGames.$inferInsert, "id" | "blockId" | "playerId" | "createdAt" | "updatedAt">;

async function validateGame(db: Db, ownerPlayerId: string, input: GameInput): Promise<GameValues> {
  if (!input.championId?.trim()) throw new JournalError("Choose the champion you played.");
  if (!isGameResult(input.result)) throw new JournalError("Record the result: win or loss.");
  if (input.mainMistake && !isMainMistake(input.mainMistake)) throw new JournalError("Unknown mistake category.");
  if (input.role && !ROLES.includes(input.role)) throw new JournalError("Unknown role.");
  if (input.teammatePlayerId) {
    if (input.teammatePlayerId === ownerPlayerId) throw new JournalError("You cannot tag yourself as the teammate.");
    const [mate] = await db.select({ id: players.id }).from(players).where(eq(players.id, input.teammatePlayerId));
    if (!mate) throw new JournalError("That teammate no longer exists.");
  }
  if (input.accountId) {
    const [acc] = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(and(eq(riotAccounts.id, input.accountId), eq(riotAccounts.playerId, ownerPlayerId)));
    if (!acc) throw new JournalError("That Riot account is not linked to your profile.");
  }
  let link = "";
  try {
    link = cleanLink(input.link);
  } catch (err) {
    throw new JournalError((err as Error).message);
  }
  return {
    championId: input.championId.trim(),
    enemyChampionId: input.enemyChampionId?.trim() || null,
    result: input.result,
    mainMistake: input.mainMistake || null,
    notes: (input.notes ?? "").trim().slice(0, 1000),
    link,
    role: input.role ?? null,
    playedAt: input.playedAt ?? new Date(),
    teammatePlayerId: input.teammatePlayerId || null,
    accountId: input.accountId || null,
    riotMatchId: input.riotMatchId?.trim() || null,
  };
}

/** Adds a game to the active block (starting one when needed); the sixth game completes the block. */
export async function addGame(db: Db, ownerPlayerId: string, input: GameInput): Promise<{ game: RankedGameView; block: RankedBlockView; blockCompleted: boolean }> {
  const values = await validateGame(db, ownerPlayerId, input);
  if (values.riotMatchId) {
    const [dup] = await db.select({ id: rankedGames.id }).from(rankedGames).where(and(eq(rankedGames.playerId, ownerPlayerId), eq(rankedGames.riotMatchId, values.riotMatchId)));
    if (dup) throw new JournalError("That game is already in your journal.");
  }
  const block = await startBlock(db, ownerPlayerId);
  const [row] = await db.insert(rankedGames).values({ ...values, blockId: block.id, playerId: ownerPlayerId }).returning();
  const [count] = await db.select({ n: sql<number>`count(*)` }).from(rankedGames).where(eq(rankedGames.blockId, block.id));
  const blockCompleted = Number(count?.n ?? 0) >= BLOCK_SIZE;
  if (blockCompleted) await db.update(rankedBlocks).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(rankedBlocks.id, block.id));
  const refreshed = (await getBlock(db, ownerPlayerId, block.id))!.block;
  return { game: toGame(row!), block: refreshed, blockCompleted };
}

export async function updateGame(db: Db, ownerPlayerId: string, gameId: string, input: GameInput): Promise<RankedGameView> {
  const [existing] = await db.select().from(rankedGames).where(and(eq(rankedGames.id, gameId), eq(rankedGames.playerId, ownerPlayerId)));
  if (!existing) throw new JournalError("Game not found.");
  const values = await validateGame(db, ownerPlayerId, { ...input, riotMatchId: existing.riotMatchId, accountId: input.accountId === undefined ? existing.accountId : input.accountId, playedAt: input.playedAt ?? existing.playedAt });
  const [row] = await db.update(rankedGames).set({ ...values, updatedAt: new Date() }).where(eq(rankedGames.id, existing.id)).returning();
  return toGame(row!);
}

export async function deleteGame(db: Db, ownerPlayerId: string, gameId: string): Promise<void> {
  const deleted = await db.delete(rankedGames).where(and(eq(rankedGames.id, gameId), eq(rankedGames.playerId, ownerPlayerId))).returning({ id: rankedGames.id });
  if (deleted.length === 0) throw new JournalError("Game not found.");
}

export interface GameFilter {
  blockId?: string;
  championId?: string;
  mistake?: MainMistake;
  /** "solo" = no teammate tagged; a player id = games with that teammate. */
  teammate?: "solo" | string;
  limit?: number;
  offset?: number;
}

export async function listGames(db: Db, ownerPlayerId: string, filter: GameFilter = {}): Promise<RankedGameView[]> {
  const where = [eq(rankedGames.playerId, ownerPlayerId)];
  if (filter.blockId) where.push(eq(rankedGames.blockId, filter.blockId));
  if (filter.championId) where.push(eq(rankedGames.championId, filter.championId));
  if (filter.mistake) where.push(eq(rankedGames.mainMistake, filter.mistake));
  if (filter.teammate === "solo") where.push(isNull(rankedGames.teammatePlayerId));
  else if (filter.teammate) where.push(eq(rankedGames.teammatePlayerId, filter.teammate));
  const rows = await db
    .select()
    .from(rankedGames)
    .where(and(...where))
    .orderBy(desc(rankedGames.playedAt), desc(rankedGames.createdAt))
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0);
  return rows.map(toGame);
}

/** The four dashboard numbers, from concise aggregates (never the whole history). */
export async function getDashboard(db: Db, ownerPlayerId: string): Promise<JournalDashboard & { focus: string }> {
  const [profile, rows] = await Promise.all([
    getRankedProfile(db, ownerPlayerId),
    db.select({ result: rankedGames.result, mainMistake: rankedGames.mainMistake, n: sql<number>`count(*)` }).from(rankedGames).where(eq(rankedGames.playerId, ownerPlayerId)).groupBy(rankedGames.result, rankedGames.mainMistake),
  ]);
  const expanded: Array<{ result: "win" | "loss"; mainMistake: MainMistake | null }> = [];
  for (const r of rows) for (let i = 0; i < Number(r.n); i++) expanded.push({ result: r.result === "win" ? "win" : "loss", mainMistake: isMainMistake(r.mainMistake) ? r.mainMistake : null });
  return { ...summariseGames(expanded), focus: profile.focus };
}

export interface JournalStatistics {
  champions: ChampionPerformance[];
  mistakes: Array<{ key: MainMistake; label: string; count: number }>;
  matchups: MatchupRecord[];
  games: number;
}

/** Simple summaries over the owner's games (optionally only games with one teammate / solo). */
export async function getStatistics(db: Db, ownerPlayerId: string, filter: Pick<GameFilter, "teammate"> = {}): Promise<JournalStatistics> {
  const where = [eq(rankedGames.playerId, ownerPlayerId)];
  if (filter.teammate === "solo") where.push(isNull(rankedGames.teammatePlayerId));
  else if (filter.teammate) where.push(eq(rankedGames.teammatePlayerId, filter.teammate));
  const rows = await db
    .select({ championId: rankedGames.championId, enemyChampionId: rankedGames.enemyChampionId, result: rankedGames.result, mainMistake: rankedGames.mainMistake, n: sql<number>`count(*)` })
    .from(rankedGames)
    .where(and(...where))
    .groupBy(rankedGames.championId, rankedGames.enemyChampionId, rankedGames.result, rankedGames.mainMistake);
  const games: Array<{ championId: string; enemyChampionId: string | null; result: "win" | "loss"; mainMistake: MainMistake | null }> = [];
  for (const r of rows) for (let i = 0; i < Number(r.n); i++) games.push({ championId: r.championId, enemyChampionId: r.enemyChampionId, result: r.result === "win" ? "win" : "loss", mainMistake: isMainMistake(r.mainMistake) ? r.mainMistake : null });
  return { champions: championPerformance(games), mistakes: mistakeCounts(games), matchups: matchupRecords(games), games: games.length };
}

export interface ImportableMatch {
  matchId: string;
  accountId: string;
  riotId: string;
  playedAt: Date;
  championId: string;
  enemyChampionId: string | null;
  role: Role | null;
  win: boolean;
  gameDuration: number | null;
  /** "8/2/4" when the per-game details were stored. */
  kda: { kills: number; deaths: number; assists: number } | null;
}

/** Recent Solo/Duo games from the owner's synced accounts that are not in the journal yet. */
export async function listImportableMatches(db: Db, ownerPlayerId: string, limit = 10): Promise<ImportableMatch[]> {
  const accounts = await db.select({ id: riotAccounts.id, gameName: riotAccounts.gameName, tagLine: riotAccounts.tagLine }).from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
  if (accounts.length === 0) return [];
  const journaled = db.select({ id: rankedGames.riotMatchId }).from(rankedGames).where(and(eq(rankedGames.playerId, ownerPlayerId), sql`${rankedGames.riotMatchId} is not null`));
  const rows = await db
    .select()
    .from(accountMatches)
    .where(and(inArray(accountMatches.accountId, accounts.map((a) => a.id)), eq(accountMatches.queueId, 420), sql`${accountMatches.championId} is not null`, sql`${accountMatches.win} is not null`, sql`${accountMatches.matchId} not in (${journaled})`))
    .orderBy(desc(accountMatches.gameCreation))
    .limit(limit);
  const byAccount = new Map(accounts.map((a) => [a.id, `${a.gameName}#${a.tagLine}`]));
  return rows.map((r) => ({
    matchId: r.matchId,
    accountId: r.accountId,
    riotId: byAccount.get(r.accountId) ?? "",
    playedAt: new Date(r.gameCreation),
    championId: r.championId!,
    enemyChampionId: r.enemyChampionId,
    role: r.role && (ROLES as readonly string[]).includes(r.role) ? (r.role as Role) : null,
    win: !!r.win,
    gameDuration: r.gameDuration,
    kda: r.kills !== null && r.kills >= 0 && r.deaths !== null && r.assists !== null ? { kills: r.kills, deaths: r.deaths, assists: r.assists } : null,
  }));
}

/** Imports one synced match: the facts come from the stored match row, the owner adds the rest later. */
export async function importMatch(db: Db, ownerPlayerId: string, matchId: string, extra: Pick<GameInput, "mainMistake" | "notes" | "teammatePlayerId"> = {}): Promise<{ game: RankedGameView; block: RankedBlockView; blockCompleted: boolean }> {
  const accounts = await db.select({ id: riotAccounts.id }).from(riotAccounts).where(eq(riotAccounts.playerId, ownerPlayerId));
  const [row] = accounts.length ? await db.select().from(accountMatches).where(and(eq(accountMatches.matchId, matchId), inArray(accountMatches.accountId, accounts.map((a) => a.id)))) : [];
  if (!row || !row.championId || row.win === null) throw new JournalError("That match is not in your synced Riot data.");
  if (row.queueId !== 420) throw new JournalError("Only Ranked Solo/Duo games belong in this journal.");
  return addGame(db, ownerPlayerId, {
    championId: row.championId,
    enemyChampionId: row.enemyChampionId,
    result: row.win ? "win" : "loss",
    role: row.role && (ROLES as readonly string[]).includes(row.role) ? (row.role as Role) : null,
    playedAt: new Date(row.gameCreation),
    accountId: row.accountId,
    riotMatchId: row.matchId,
    mainMistake: extra.mainMistake ?? null,
    notes: extra.notes ?? "",
    teammatePlayerId: extra.teammatePlayerId ?? null,
  });
}

/** Teammate ids tagged anywhere in the owner's games, for the statistics filter chips. */
export async function listTaggedTeammateIds(db: Db, ownerPlayerId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: rankedGames.teammatePlayerId })
    .from(rankedGames)
    .where(and(eq(rankedGames.playerId, ownerPlayerId), sql`${rankedGames.teammatePlayerId} is not null`));
  return rows.map((r) => r.id).filter((id): id is string => !!id);
}

/** Team members the owner may tag as a duo partner (everyone else on the roster, not archived). */
export async function listTeammateOptions(db: Db, teamId: string, ownerPlayerId: string): Promise<Array<{ id: string; displayName: string }>> {
  return db
    .select({ id: players.id, displayName: players.displayName })
    .from(players)
    .where(and(eq(players.teamId, teamId), ne(players.id, ownerPlayerId), isNull(players.archivedAt)))
    .orderBy(players.displayName);
}

/** Names for teammate ids that appear in the owner's games (archived or not; deleted ones read "former teammate"). */
export async function teammateNames(db: Db, ids: Array<string | null>): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return {};
  const rows = await db.select({ id: players.id, displayName: players.displayName }).from(players).where(inArray(players.id, unique));
  return Object.fromEntries(rows.map((r) => [r.id, r.displayName]));
}
