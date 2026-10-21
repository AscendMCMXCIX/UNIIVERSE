"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { NotAuthorizedError, requireSession } from "@/server/auth/session";
import { getOrCreateTeam } from "@/server/repositories/team";
import { createVerificationClient } from "@/server/riot/verify-identity";
import { RiotApiError } from "@/server/riot/api/client";
import { parseRiotId } from "@/domain/opgg";
import { parseScoutContent } from "@/domain/clash-scout/schema";
import { canArchiveScouts, canDeleteScouts, canEditScout, canScout, clashScoutEnabled } from "@/server/clash/access";
import { keepProvenVerifications, verificationProof } from "@/server/clash/proof";
import { createScout, deleteScout, earlierScoutsOf, getScout, ScoutConflictError, scoutCreator, setScoutArchived, updateScout, type EarlierScout } from "@/server/clash/scouts";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): { ok: false; error: string } => {
  if (err instanceof NotAuthorizedError || err instanceof ScoutConflictError) return { ok: false, error: err.message };
  console.error(err);
  return { ok: false, error: "That did not work. Try again." };
};

async function scoutingTeam() {
  const session = await requireSession();
  if (!clashScoutEnabled()) throw new NotAuthorizedError("Clash Scout is switched off.");
  if (!canScout(session)) throw new NotAuthorizedError("Clash Scout is for members of the team.");
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  return { session, db, teamId: team.id };
}

const touch = (id?: string) => {
  revalidatePath("/clash");
  if (id) revalidatePath(`/clash/${id}`);
};

/** Saves a draft to the team's history. Verified accounts are kept only when this server verified them. */
export async function saveScoutAction(input: unknown): Promise<Result<{ id: string }>> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const parsed = parseScoutContent(input);
    if (!parsed.ok) return parsed;
    const id = await createScout(db, teamId, session.userId, keepProvenVerifications(teamId, parsed.content));
    touch();
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err);
  }
}

/** Saves changes to a saved scout: its creator, or a lineup manager. */
export async function updateScoutAction(scoutId: string, input: unknown, expectedUpdatedAt: string | null): Promise<Result<{ updatedAt: string }>> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const current = await getScout(db, teamId, String(scoutId));
    if (!current) return { ok: false, error: "This scout no longer exists." };
    if (!canEditScout(session, current.createdBy)) throw new NotAuthorizedError("Only the member who saved this scout, or a lineup manager, can change it.");
    const parsed = parseScoutContent(input);
    if (!parsed.ok) return parsed;
    const known = current.content.players.filter((p) => p.verification === "verified" && p.riotId && p.puuid).map((p) => ({ riotId: p.riotId!, puuid: p.puuid! }));
    const updatedAt = await updateScout(db, teamId, current.id, session.userId, keepProvenVerifications(teamId, parsed.content, known), expectedUpdatedAt ? new Date(expectedUpdatedAt) : null);
    touch(current.id);
    return { ok: true, data: { updatedAt: updatedAt.toISOString() } };
  } catch (err) {
    return fail(err);
  }
}

export async function setScoutArchivedAction(scoutId: string, archived: boolean): Promise<Result> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    if (!canArchiveScouts(session)) throw new NotAuthorizedError("Only a lineup manager can archive or restore scouts.");
    if (!(await setScoutArchived(db, teamId, String(scoutId), archived === true))) return { ok: false, error: "This scout no longer exists." };
    touch(String(scoutId));
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteScoutAction(scoutId: string): Promise<Result> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    if (!canDeleteScouts(session)) throw new NotAuthorizedError("Only the Owner can delete scouts permanently.");
    if (!(await scoutCreator(db, teamId, String(scoutId)))) return { ok: false, error: "This scout no longer exists." };
    await deleteScout(db, teamId, String(scoutId));
    touch();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// One verification per member every 2 seconds, at most 40 an hour: enough for a scouting window, never a crawl.
const recent = new Map<string, number[]>();
function throttled(key: string): boolean {
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= 40 || (list.length && now - list[list.length - 1]! < 2_000)) return true;
  list.push(now);
  recent.set(key, list);
  return false;
}

export interface VerifiedAccount {
  riotId: string;
  puuid: string;
  proof: string;
  /** The team's earlier saved scouts with this account (by Riot's account id), newest first. */
  earlier: Array<Omit<EarlierScout, "scoutedAt" | "puuid"> & { scoutedAt: string }>;
}

/**
 * Checks a full Riot ID (GameName#TAG) the member typed or confirmed with Riot's Account API, on
 * the opponents' region. Only an exact, existing Riot ID verifies; nothing is searched or guessed.
 */
export async function verifyOpponentAction(input: { riotId: string; platform: string; scoutId?: string | null }): Promise<Result<VerifiedAccount>> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const parsed = parseRiotId(String(input?.riotId ?? ""));
    if (!parsed) return { ok: false, error: "Enter the full Riot ID: the name, then # and the tag (for example Name#OCE)." };
    const platform = String(input?.platform ?? "").toLowerCase();
    if (!/^[a-z]{2,4}\d?$/.test(platform)) return { ok: false, error: "Choose the opponents' region first." };
    if (throttled(session.userId ?? session.label)) return { ok: false, error: "Too many checks in a short time. Wait a moment and try again." };
    const client = createVerificationClient();
    if (!client) return { ok: false, error: "Riot verification is not available: the server has no Riot API key." };
    let account: { puuid: string; gameName?: string; tagLine?: string };
    try {
      account = await client.accountByRiotId(platform, parsed.gameName, parsed.tagLine);
    } catch (err) {
      if (err instanceof RiotApiError && err.status === 404) return { ok: false, error: `Riot has no account named ${parsed.gameName}#${parsed.tagLine}. Check the name and the tag.` };
      if (err instanceof RiotApiError && (err.status === 429 || err.status >= 500 || err.status === 0)) return { ok: false, error: "Riot is busy or unreachable right now. Try again in a minute." };
      return { ok: false, error: "Riot could not check this Riot ID right now." };
    }
    const riotId = `${account.gameName?.trim() || parsed.gameName}#${account.tagLine?.trim() || parsed.tagLine}`;
    const earlier = await earlierScoutsOf(db, teamId, [account.puuid], input?.scoutId ?? null);
    return {
      ok: true,
      data: { riotId, puuid: account.puuid, proof: verificationProof(teamId, platform, riotId, account.puuid), earlier: earlier.map((e) => ({ scoutId: e.scoutId, opponentName: e.opponentName, scoutedAt: e.scoutedAt.toISOString() })) },
    };
  } catch (err) {
    return fail(err);
  }
}
