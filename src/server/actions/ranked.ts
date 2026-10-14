"use server";

import type { BlockTarget } from "@/domain/ranked-improvement";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { getSession, NotAuthorizedError } from "@/server/auth/session";
import { journalOwnerFor } from "@/server/ranked/owner";
import type { Role } from "@/domain/roles";
import { addGame, deleteGame, finishBlock, importMatch, JournalError, setBlockSize, setPlayedWith, startBlock, updateGame, updateRankedProfile, type GameInput, type RankedBlockView, type RankedGameView, type RankedProfileView } from "@/server/ranked/repository";

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };
const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof JournalError || err instanceof NotAuthorizedError ? err.message : "Something went wrong. Please try again." });

async function owner(): Promise<string> {
  return journalOwnerFor(await getSession());
}

function touch() {
  revalidatePath("/overview");
  revalidatePath("/overview/blocks");
  revalidatePath("/overview/blocks/history");
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

export async function addRankedGameAction(input: GameFormInput): Promise<Result<{ game: RankedGameView; block: RankedBlockView; targetReached: boolean }>> {
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

export async function finishRankedBlockAction(blockId: string): Promise<Result<RankedBlockView>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const block = await finishBlock(db, playerId, blockId);
    touch();
    return { ok: true, data: block };
  } catch (err) {
    return fail(err);
  }
}

/** Starts a block of the size the player chose. */
export async function startRankedBlockAction(plannedGames: BlockTarget): Promise<Result<RankedBlockView>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const block = await startBlock(db, playerId, plannedGames);
    touch();
    return { ok: true, data: block };
  } catch (err) {
    return fail(err);
  }
}

export async function importRankedMatchAction(matchId: string, extra: { mainMistake?: string | null; notes?: string; teammatePlayerId?: string | null; plannedGames?: BlockTarget | null } = {}): Promise<Result<{ game: RankedGameView; block: RankedBlockView; targetReached: boolean }>> {
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

export async function saveRankedFocusAction(patch: Partial<Omit<RankedProfileView, "playerId">>): Promise<Result<RankedProfileView>> {
  try {
    const playerId = await owner();
    const db = await getAppDb();
    const profile = await updateRankedProfile(db, playerId, patch);
    touch();
    return { ok: true, data: profile };
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
