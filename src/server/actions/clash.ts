"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { NotAuthorizedError, requireSession } from "@/server/auth/session";
import { getOrCreateTeam } from "@/server/repositories/team";
import { createVerificationClient } from "@/server/riot/verify-identity";
import { RiotApiError } from "@/server/riot/api/client";
import { parseRiotId } from "@/domain/opgg";
import { candidateQuerySchema, parseScoutContent } from "@/domain/clash-scout/schema";
import type { CandidateView } from "@/domain/clash-scout/identity";
import { findCandidates } from "@/server/clash/candidates";
import { listChampions } from "@/server/repositories/champions";
import { canDeleteScout, canEditScout, canScout, clashScoutEnabled } from "@/server/clash/access";
import { keepProvenVerifications, verificationProof } from "@/server/clash/proof";
import { createScout, deleteScout, earlierScoutsOf, getScout, ScoutConflictError, updateScout, type EarlierScout } from "@/server/clash/scouts";
import { recordAudit } from "@/server/audit/log";
import { erasureFilter, type ErasureFilter } from "@/server/privacy/ledger";
import { emptyPlayer, type ScoutContent } from "@/domain/clash-scout/types";

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

/**
 * A scout never keeps a player whose personal data was erased from UNIIVERSE (server/privacy): the
 * slot is saved empty and the member is told how many were left out.
 */
function withoutErased(content: ScoutContent, erased: ErasureFilter): { content: ScoutContent; removed: number } {
  if (erased.empty) return { content, removed: 0 };
  let removed = 0;
  const players = content.players.map((p) => {
    if (!erased.puuid(p.puuid) && !erased.riotId(p.riotId) && !erased.riotId(p.name)) return p;
    removed++;
    return emptyPlayer(p.slot);
  });
  return { content: { ...content, players }, removed };
}

const ERASED_PLAYER = "This Riot account cannot be checked or kept here.";

const touch = (id?: string) => {
  revalidatePath("/clash");
  if (id) revalidatePath(`/clash/${id}`);
};

/** Saves a draft to the team's history. Verified accounts are kept only when this server verified them. */
export async function saveScoutAction(input: unknown): Promise<Result<{ id: string; leftOut: number }>> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const parsed = parseScoutContent(input);
    if (!parsed.ok) return parsed;
    const kept = withoutErased(keepProvenVerifications(teamId, parsed.content), await erasureFilter(db));
    const id = await createScout(db, teamId, session.userId, kept.content);
    touch();
    return { ok: true, data: { id, leftOut: kept.removed } };
  } catch (err) {
    return fail(err);
  }
}

/** Saves changes to a saved scout: its creator, or a lineup manager. `kept` is what was saved when players were left out. */
export async function updateScoutAction(scoutId: string, input: unknown, expectedUpdatedAt: string | null): Promise<Result<{ updatedAt: string; leftOut: number; kept: ScoutContent | null }>> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const current = await getScout(db, teamId, String(scoutId));
    if (!current) return { ok: false, error: "This scout no longer exists." };
    if (!canEditScout(session, current.createdBy)) throw new NotAuthorizedError("Only the member who saved this scout, or a lineup manager, can change it.");
    const parsed = parseScoutContent(input);
    if (!parsed.ok) return parsed;
    const known = current.content.players.filter((p) => p.verification === "verified" && p.riotId && p.puuid).map((p) => ({ riotId: p.riotId!, puuid: p.puuid! }));
    const kept = withoutErased(keepProvenVerifications(teamId, parsed.content, known), await erasureFilter(db));
    const updatedAt = await updateScout(db, teamId, current.id, session.userId, kept.content, expectedUpdatedAt ? new Date(expectedUpdatedAt) : null);
    touch(current.id);
    return { ok: true, data: { updatedAt: updatedAt.toISOString(), leftOut: kept.removed, kept: kept.removed ? kept.content : null } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Deletes a saved scout for the whole team, with its verified accounts (nothing else): the member
 * who saved it, or a lineup manager, after the page's confirmation. Recorded in Audit Logs.
 */
export async function deleteScoutAction(scoutId: string): Promise<Result> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const scout = await getScout(db, teamId, String(scoutId));
    if (!scout) return { ok: false, error: "This scout no longer exists." };
    if (!canDeleteScout(session, scout.createdBy)) throw new NotAuthorizedError("Only the member who saved this scout, or a lineup manager, can delete it.");
    if (!(await deleteScout(db, teamId, scout.id))) return { ok: false, error: "This scout no longer exists." };
    await recordAudit(db, session, { action: "clash.scout-delete", target: { type: "scout", id: scout.id, name: scout.opponentName }, details: { scouted: scout.scoutedAt.toISOString().slice(0, 10), verified: scout.playersVerified } });
    touch();
    return { ok: true, data: undefined };
  } catch (err) {
    return fail(err);
  }
}

// One verification per member every 2 seconds, at most 40 an hour: enough for a scouting window, never a crawl.
const recent = new Map<string, number[]>();
function throttled(key: string, per = recent, gapMs = 2_000, hourly = 40): boolean {
  const now = Date.now();
  const list = (per.get(key) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= hourly || (list.length && now - list[list.length - 1]! < gapMs)) return true;
  list.push(now);
  per.set(key, list);
  return false;
}

// Looking for potential matches: one search per member every 2 seconds, at most 60 an hour (each asks Riot about a few accounts at most).
const lookups = new Map<string, number[]>();

/**
 * Potential matches for a scout's names (server/clash/candidates.ts): accounts UNIIVERSE already
 * knows by that name on this server, each under its current Riot ID, with what agrees and what
 * does not. Never a verification: a member confirms one (which asks Riot about that exact Riot ID)
 * or leaves it.
 */
export async function findCandidatesAction(input: unknown): Promise<Result<Record<number, CandidateView[]>>> {
  try {
    const { session, db, teamId } = await scoutingTeam();
    const parsed = candidateQuerySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "These names could not be looked up." };
    if (throttled(session.userId ?? session.label, lookups, 2_000, 60)) return { ok: false, error: "Too many lookups in a short time. Wait a moment and try again." };
    const champions = new Map((await listChampions(db)).map((c) => [c.id, c.name]));
    const found = await findCandidates(db, teamId, parsed.data.platform, parsed.data.players, createVerificationClient(), (id) => champions.get(id) ?? id);
    // Never suggest someone whose personal data was erased.
    const erased = await erasureFilter(db);
    if (!erased.empty) for (const slot of Object.keys(found)) found[Number(slot)] = found[Number(slot)]!.filter((c) => !erased.riotId(c.riotId));
    return { ok: true, data: found };
  } catch (err) {
    return fail(err);
  }
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
    const erased = await erasureFilter(db);
    if (erased.puuid(account.puuid) || erased.riotId(riotId)) return { ok: false, error: ERASED_PLAYER };
    const earlier = await earlierScoutsOf(db, teamId, [account.puuid], input?.scoutId ?? null);
    return {
      ok: true,
      data: { riotId, puuid: account.puuid, proof: verificationProof(teamId, platform, riotId, account.puuid), earlier: earlier.map((e) => ({ scoutId: e.scoutId, opponentName: e.opponentName, scoutedAt: e.scoutedAt.toISOString() })) },
    };
  } catch (err) {
    return fail(err);
  }
}
