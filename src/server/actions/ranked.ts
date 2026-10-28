"use server";

import type { BlockTarget } from "@/domain/ranked-improvement";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { getSession, NotAuthorizedError } from "@/server/auth/session";
import { journalOwnerFor } from "@/server/ranked/owner";
import type { Role } from "@/domain/roles";
import { addGame, deleteBlock, deleteGame, importMatch, JournalError, setBlockSize, setPlayedWith, updateGame, type GameInput, type RankedBlockView, type RankedGameView } from "@/server/ranked/repository";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof JournalError || err instanceof NotAuthorizedError ? err.message : "Something went wrong. Please try again." });

async function owner(): Promise<string> {
  return journalOwnerFor(await getSession());
}

function touch() {
  revalidatePath("/overview/development", "layout");
}

export interface GameFormInput {
  championId: string;
  enemyChampionId?: string | null;
  result: "win" | "loss";
  mainMistake?: string | null;
  notes?: string;
  link?: string;
  role?: Role | null;
  /** ISO date-time, optional. */
  playedAt?: string | null;
  teammatePlayerId?: string | null;
  accountId?: string | null;
  /** Size of the block to start when none is in progress. */
  plannedGames?: BlockTarget | null;
}

function toInput(input: GameFormInput): GameInput {
  const playedAt = input.playedAt ? new Date(input.playedAt) : null;
  return { ...input, playedAt: playedAt && !Number.isNaN(playedAt.getTime()) ? playedAt : null };
}

export async function addRankedGameAction(input: GameFormInput): Promise<Result<{ game: RankedGameView; block: RankedBlockView; targetReached: boolean; limitReached: boolean }>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const data = await addGame(db, playerId, toInput(input));
    touch();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRankedGameAction(gameId: string, input: GameFormInput): Promise<Result<RankedGameView>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const game = await updateGame(db, playerId, gameId, toInput(input));
    touch();
    return { ok: true, data: game };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteRankedGameAction(gameId: string): Promise<Result> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    await deleteGame(db, playerId, gameId);
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes one of your own blocks with its journal entries. The owner comes from the session (never
 * the request), so another player's block is simply not found. Riot match data is never touched.
 */
export async function deleteRankedBlockAction(blockId: string): Promise<Result<{ label: string; games: number }>> {
  try {
    const playerId = await owner();
    if (typeof blockId !== "string" || !/^[0-9a-f-]{36}$/i.test(blockId)) return { ok: false, error: "Block not found." };
    const db = await getAppDb();
    const data = await deleteBlock(db, playerId, blockId);
    touch();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function importRankedMatchAction(matchId: string, extra: { mainMistake?: string | null; notes?: string; teammatePlayerId?: string | null; plannedGames?: BlockTarget | null } = {}): Promise<Result<{ game: RankedGameView; block: RankedBlockView; targetReached: boolean; limitReached: boolean }>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const data = await importMatch(db, playerId, matchId, extra);
    touch();
    return { ok: true, data };
  } catch (err) {
    return fail(err);
  }
}

export async function setRankedBlockSizeAction(blockId: string, plannedGames: BlockTarget): Promise<Result<RankedBlockView>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const block = await setBlockSize(db, playerId, blockId, plannedGames);
    touch();
    return { ok: true, data: block };
  } catch (err) {
    return fail(err);
  }
}

/** Corrects a game's "played with": remove a detected or tagged teammate, or add one. */
export async function setPlayedWithAction(gameId: string, teammateId: string, played: boolean): Promise<Result<RankedGameView>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const game = await setPlayedWith(db, playerId, gameId, teammateId, played);
    touch();
    return { ok: true, data: game };
  } catch (err) {
    return fail(err);
  }
}
