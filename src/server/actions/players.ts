"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ROLES } from "@/domain/roles";
import { MAX_POOL_SIZE, type RolePool } from "@/domain/roster";
import { CARD_ACCENTS } from "@/domain/player-card";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission, requirePermission, requirePlayerEditor } from "@/server/auth/session";
import { applyLineupPreset, archivePlayer, createPlayer, deleteLineupPreset, getOrCreateTeam, PlayerValidationError, saveCurrentLineupAs, setLineupSlot, updatePlayer } from "@/server/repositories/team";
import { traced } from "@/server/observability/log";

const playerSchema = z.object({
  displayName: z.string().min(1).max(40),
  riotId: z.string().max(60).optional().nullable(),
  primaryRole: z.enum(ROLES),
  secondaryRole: z.enum(ROLES).nullable().optional(),
  notes: z.string().max(2000).optional(),
  /** Retired split (Phase 11): every profile is "main"; team membership is a separate switch. */
  group: z.literal("main").optional(),
  primaryPool: z.array(z.string().min(1)).max(MAX_POOL_SIZE).optional(),
  secondaryPool: z.array(z.string().min(1)).max(MAX_POOL_SIZE).optional(),
});

export type PlayerFormInput = z.infer<typeof playerSchema>;
export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(err: unknown): ActionResult<never> {
  if (err instanceof PlayerValidationError || (err as Error).name === "NotAuthorizedError" || (err as Error).constructor?.name === "UserError") return { ok: false, error: (err as Error).message };
  if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => i.message).join("; ") };
  return { ok: false, error: (err as Error).message ?? "Something went wrong." };
}

function touch() {
  revalidatePath("/team");
  // The directory and every profile under it (a card's look shows on its owner's profile header).
  revalidatePath("/players", "layout");
  revalidatePath("/overview", "layout");
  revalidatePath("/me");
  // Leaderboards and Played Together show each player's card look too.
  revalidatePath("/leaderboards");
  revalidatePath("/matches", "layout");
}

export async function currentSessionAction() {
  return getSession();
}

export async function createPlayerAction(input: PlayerFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("manage-players");
    const parsed = playerSchema.parse(input);
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    const player = await createPlayer(db, team.id, parsed);
    touch();
    return { ok: true, data: { id: player.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function updatePlayerAction(playerId: string, input: PlayerFormInput): Promise<ActionResult> {
  return traced("player.update", () => updatePlayerCore(playerId, input));
}

async function updatePlayerCore(playerId: string, input: PlayerFormInput): Promise<ActionResult> {
  try {
    await requirePlayerEditor(playerId);
    const parsed = playerSchema.parse(input);
    const db = await getAppDb();
    await updatePlayer(db, playerId, parsed);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function archivePlayerAction(playerId: string, archived: boolean): Promise<ActionResult> {
  try {
    await requirePermission("manage-players");
    const db = await getAppDb();
    await archivePlayer(db, playerId, archived);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Admin delete from the profile editor: the same rules as Admin → People & Access. A profile
 * with an account is deleted together with that account (never leaving a login without a
 * profile); the admin's own account and the last admin are protected.
 */
export async function deletePlayerAction(playerId: string): Promise<ActionResult> {
  try {
    const session = await requirePermission("manage-users");
    const db = await getAppDb();
    const { users } = await import("@/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const { deleteAccount, deleteProfile } = await import("@/server/auth/account-admin");
    const [linked] = await db.select({ id: users.id }).from(users).where(eq(users.playerId, playerId));
    if (linked) await deleteAccount(db, session.userId, linked.id, { eraseProfile: true });
    else await deleteProfile(db, playerId);
    touch();
    revalidatePath("/admin/players");
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** `bench`: a substitute from the back of a Team card replaces `replacing`, only if the lineup is unchanged (see setLineupSlot). */
export async function setLineupSlotAction(role: (typeof ROLES)[number], playerId: string | null, bench?: { replacing: string }): Promise<ActionResult> {
  try {
    await requirePermission("manage-lineup");
    const guard = bench === undefined ? undefined : z.object({ replacing: z.string().min(1) }).parse(bench);
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    await setLineupSlot(db, team.id, role, playerId, guard);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Saves the current lineup as a named preset. */
export async function saveLineupPresetAction(name: string): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission("manage-lineup");
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    const preset = await saveCurrentLineupAs(db, team.id, name);
    touch();
    return { ok: true, data: { id: preset.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function applyLineupPresetAction(presetId: string): Promise<ActionResult> {
  try {
    await requirePermission("manage-lineup");
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    await applyLineupPreset(db, team.id, presetId);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteLineupPresetAction(presetId: string): Promise<ActionResult> {
  try {
    await requirePermission("manage-lineup");
    const db = await getAppDb();
    const team = await getOrCreateTeam(db);
    await deleteLineupPreset(db, team.id, presetId);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const poolSchema = z.array(z.string().min(1).max(40)).max(MAX_POOL_SIZE);
const patchSchema = z.object({
  primaryRole: z.enum(ROLES).optional(),
  secondaryRole: z.enum(ROLES).nullable().optional(),
  primaryPool: poolSchema.optional(),
  secondaryPool: poolSchema.optional(),
  additionalRoles: z.array(z.object({ role: z.enum(ROLES), pool: poolSchema })).max(3).optional(),
});

export type ProfileSaveResult =
  | { ok: true; version: string }
  | { ok: false; error: string; conflict?: { version: string; primaryRole: (typeof ROLES)[number]; secondaryRole: (typeof ROLES)[number] | null; primaryPool: string[]; secondaryPool: string[]; additionalRoles: RolePool[] } };

/**
 * Autosave for the profile's roles and champion pools (inline editing on the profile, Team and
 * onboarding). Only the given fields change; `version` guards against overwriting a newer edit.
 */
export async function saveProfilePatchAction(playerId: string, patch: z.infer<typeof patchSchema>, version: string | null): Promise<ProfileSaveResult> {
  try {
    await requirePlayerEditor(playerId);
    const parsed = patchSchema.parse(patch);
    const db = await getAppDb();
    const { patchPlayerProfile } = await import("@/server/repositories/team");
    const r = await patchPlayerProfile(db, playerId, parsed, version);
    if (!r.ok) {
      const p = r.player;
      if (!p.primaryRole) return { ok: false, error: "This profile was changed somewhere else; reload to see the latest version." };
      return { ok: false, error: "This profile was changed somewhere else; showing the latest version.", conflict: { version: r.version, primaryRole: p.primaryRole, secondaryRole: p.secondaryRole, primaryPool: p.primaryPool, secondaryPool: p.secondaryPool, additionalRoles: p.additionalRoles } };
    }
    touch();
    return { ok: true, version: r.version };
  } catch (err) {
    const f = fail(err);
    return { ok: false, error: f.ok ? "Something went wrong." : f.error };
  }
}

const cardStyleSchema = z.object({
  featuredChampionId: z.string().min(1).max(40).nullable(),
  featuredSkinNum: z.number().int().min(0).max(999).nullable().optional(),
  cardAccent: z.enum(CARD_ACCENTS).optional(),
  /** Player Card Studio settings; validated field by field in normaliseCardStyle (never stored as sent). */
  style: z.record(z.string(), z.unknown()).optional(),
});

/**
 * The player's card identity (Team, Players and the profile header all read it): featured
 * champion (any champion in the game), one of its skins, and an accent. Own card, or a player
 * manager; checked on the server.
 */
export async function setCardStyleAction(playerId: string, input: z.infer<typeof cardStyleSchema>): Promise<ActionResult> {
  try {
    await requirePlayerEditor(playerId);
    const parsed = cardStyleSchema.parse(input);
    const db = await getAppDb();
    const { getPlayer, setCardStyle } = await import("@/server/repositories/team");
    const { isActiveChampion, listSkins } = await import("@/server/repositories/skins");
    const player = await getPlayer(db, playerId);
    if (!player) return { ok: false, error: "Player not found." };
    let skin = parsed.featuredSkinNum ?? 0;
    if (parsed.featuredChampionId) {
      if (!(await isActiveChampion(db, parsed.featuredChampionId))) return { ok: false, error: "That champion is not in the game." };
      // A skin must belong to the champion; the one already saved stays valid even if Riot retired it.
      const keepsSaved = player.featuredChampionId === parsed.featuredChampionId && player.featuredSkinNum === skin;
      if (skin > 0 && !keepsSaved && !(await listSkins(db, parsed.featuredChampionId)).some((s) => s.num === skin)) return { ok: false, error: "That skin is not available for this champion." };
    } else skin = 0;
    const { legacyAccentFor, normaliseCardStyle, resolveCardStyle, taglineProblem } = await import("@/domain/card-style");
    if (parsed.style) {
      // Fill anything missing from what the card shows today, then keep only valid values.
      const style = normaliseCardStyle(parsed.style, resolveCardStyle(player.cardStyle, player.cardAccent));
      const problem = style.identity.tagline ? taglineProblem(style.identity.tagline) : null;
      if (problem) return { ok: false, error: problem };
      await setCardStyle(db, playerId, { featuredChampionId: parsed.featuredChampionId, featuredSkinNum: skin, cardAccent: legacyAccentFor(style), cardStyle: style as unknown as Record<string, unknown> });
    } else {
      const accent = parsed.cardAccent ?? "default";
      await setCardStyle(db, playerId, { featuredChampionId: parsed.featuredChampionId, featuredSkinNum: skin, cardAccent: accent === "default" ? null : accent });
    }
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/**
 * The optional card banner (Player Card Studio), sent as a data URL the browser has already
 * cropped and resized. Own card, or a player manager; the image is checked on the server.
 */
export async function uploadCardBannerAction(playerId: string, dataUrl: string): Promise<ActionResult<{ url: string }>> {
  try {
    await requirePlayerEditor(playerId);
    if (typeof dataUrl !== "string" || dataUrl.length > 620_000) return { ok: false, error: "That banner is too large (450 KB at most after resizing)." };
    const { decodeDataUrl } = await import("@/server/images");
    const data = decodeDataUrl(dataUrl);
    if (!data) return { ok: false, error: "Use a PNG, JPEG or WebP picture." };
    const { bannerUrl, setCardBanner } = await import("@/server/repositories/card-banners");
    const version = await setCardBanner(await getAppDb(), playerId, data);
    touch();
    return { ok: true, data: { url: bannerUrl(playerId, version)! } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeCardBannerAction(playerId: string): Promise<ActionResult> {
  try {
    await requirePlayerEditor(playerId);
    const { removeCardBanner } = await import("@/server/repositories/card-banners");
    await removeCardBanner(await getAppDb(), playerId);
    touch();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/** Skins a player can choose for a champion (names and art index; the art URL is derived on the client). */
export async function listChampionSkinsAction(championId: string): Promise<ActionResult<Array<{ num: number; name: string }>>> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "Sign in again." };
    const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9]+$/).parse(championId);
    const db = await getAppDb();
    const { listSkins } = await import("@/server/repositories/skins");
    return { ok: true, data: await listSkins(db, id) };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Player Card Studio's preview, opened from the profile: the season figures the Team card shows for
 * this player in the given role, so the preview matches the real card instead of showing dashes.
 * Only for someone who may edit the card, and only figures this viewer may see (their own, or
 * teammates' with "view teammates' statistics"); null when there are none or they are not shared.
 */
export async function cardPreviewFiguresAction(playerId: string, role: string | null): Promise<ActionResult<{ season: PreviewFigures | null }>> {
  try {
    const session = await requirePlayerEditor(playerId);
    if (session.playerId !== playerId && !hasPermission(session, "view-teammate-stats")) return { ok: true, data: { season: null } };
    const parsedRole = z.enum(ROLES).nullable().parse(role);
    const db = await getAppDb();
    const { getPlayer } = await import("@/server/repositories/team");
    const player = await getPlayer(db, playerId);
    if (!player) return { ok: false, error: "Player not found." };
    const { getPlayerOverview } = await import("@/server/players/overview");
    const { seasonFigures } = await import("@/server/team/roster");
    const overview = await getPlayerOverview(db, player, { mode: "all", role: parsedRole ?? player.primaryRole ?? null, riotConfigured: !!process.env.RIOT_API_KEY });
    return { ok: true, data: { season: overview.summary.record.games > 0 ? seasonFigures(overview.summary) : null } };
  } catch (err) {
    return fail(err);
  }
}

type PreviewFigures = NonNullable<NonNullable<import("@/server/team/roster").RosterSlot["player"]>["season"]>;
