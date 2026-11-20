"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requireOwner, requirePermission } from "@/server/auth/session";
import { UserError } from "@/server/repositories/users";
import { invalidatePublicTeam } from "@/server/public/team";
import { decodeDataUrl } from "@/server/images";
import { moderateAvatar, moderateSocialLink, saveAccess, setMemberDisplayName, signOutEverywhere, type AccessSave } from "@/server/auth/member-admin";
import { auditPlayerName, auditPresetName, recordAudit } from "@/server/audit/log";
import { SOCIAL_LABELS, type SocialKind } from "@/domain/social-links";

/*
  The Owner's and administrators' tools on a member (Admin Mode → Users & Permissions, the
  overhaul's S9b). Each action establishes who is asking first; the rules live in
  auth/member-admin.ts. Every change is recorded in the audit log, without a count of sessions
  and without the text anyone typed.
*/

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError || (err as Error).name === "NotAuthorizedError" || (err as Error).name === "PlayerValidationError" ? (err as Error).message : "Something went wrong. Please try again." });

function touch() {
  for (const path of ["/settings", "/players", "/team", "/admin", "/admin/people", "/admin/audit"]) revalidatePath(path);
}

/** The Owner changes a member's display name (account and profile together); the public page follows on its next request. */
export async function setMemberDisplayNameAction(userId: string, displayName: string): Promise<Result<{ displayName: string }>> {
  try {
    const session = await requireOwner();
    if (!session.userId) return { ok: false, error: "No account session." };
    const db = await getAppDb();
    const done = await setMemberDisplayName(db, session.userId, userId, displayName);
    invalidatePublicTeam();
    await recordAudit(db, session, { action: "account.display-name", target: { type: "user", id: userId } });
    touch();
    revalidatePath("/", "layout");
    return { ok: true, data: done };
  } catch (err) {
    return fail(err);
  }
}

/** Signs another account out on every device. The result says only that it happened. */
export async function signOutEverywhereAction(userId: string): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (!session.userId) return { ok: false, error: "No account session." };
    const db = await getAppDb();
    await signOutEverywhere(db, session.userId, userId);
    await recordAudit(db, session, { action: "account.sign-out-everywhere", target: { type: "user", id: userId } });
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Moderation: replace a member's picture with a checked image (a data URL, already cropped), or remove it (null). */
export async function moderatePictureAction(userId: string, dataUrl: string | null): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (!session.userId) return { ok: false, error: "No account session." };
    let data: Buffer | null = null;
    if (dataUrl !== null) {
      if (typeof dataUrl !== "string" || dataUrl.length > 600_000) return { ok: false, error: "That picture is too large (400 KB at most)." };
      data = decodeDataUrl(dataUrl);
      if (!data) return { ok: false, error: "Use a PNG, JPEG or WebP picture." };
    }
    const db = await getAppDb();
    await moderateAvatar(db, session.userId, userId, data);
    invalidatePublicTeam();
    await recordAudit(db, session, { action: data ? "account.picture-replace" : "account.picture-remove", target: { type: "user", id: userId } });
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/** Moderation: hide a member's public link (it stays theirs, in Settings) or remove it. */
export async function moderateSocialLinkAction(playerId: string, kind: SocialKind, mode: "hide" | "remove"): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (!session.userId) return { ok: false, error: "No account session." };
    const db = await getAppDb();
    await moderateSocialLink(db, session.userId, playerId, kind, mode);
    invalidatePublicTeam();
    await recordAudit(db, session, { action: mode === "hide" ? "account.link-hide" : "account.link-remove", target: { type: "player", id: playerId, name: await auditPlayerName(db, playerId) }, details: { link: SOCIAL_LABELS[kind] } });
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Team membership, access level, extra access and administrator access, saved together or not at all. Granting
 * administrator access needs the dialog's second confirmation.
 */
export async function saveAccessAction(userId: string, input: AccessSave): Promise<Result> {
  try {
    const session = await requirePermission("manage-users");
    if (!session.userId) return { ok: false, error: "No account session." };
    const db = await getAppDb();
    const { user, administratorChanged, teamMemberChanged, levelChanged, groupsChanged } = await saveAccess(db, session.userId, userId, input);
    // Each change recorded as made, and nothing that was not changed (R6 review SR6-SEC-3): the
    // level by its name, the extra access by its groups (as Settings → Access recorded them).
    if (teamMemberChanged && user.playerId) await recordAudit(db, session, { action: "account.team-member", target: { type: "player", id: user.playerId, name: await auditPlayerName(db, user.playerId) }, details: { teamMember: input.teamMember } });
    if (levelChanged) {
      const level = input.level.level === "preset" ? ((await auditPresetName(db, input.level.presetId)) ?? "preset") : input.level.level;
      await recordAudit(db, session, { action: "account.access", target: { type: "user", id: userId, name: user.username }, details: { level } });
    }
    if (groupsChanged) await recordAudit(db, session, { action: "account.groups", target: { type: "user", id: userId, name: user.username }, details: { groups: user.accessGroups.join(", ") || "none" } });
    if (administratorChanged) await recordAudit(db, session, { action: user.isAdmin ? "account.admin-grant" : "account.admin-revoke", target: { type: "user", id: userId, name: user.username } });
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
