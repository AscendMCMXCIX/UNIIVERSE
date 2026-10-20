"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requireSession } from "@/server/auth/session";
import { UserError } from "@/server/repositories/users";
import { changeUsername, loadSocialLinks, removeAvatar, setAvatar, setDisplayName, setSocialLinks } from "@/server/repositories/profile";
import { invalidatePublicTeam } from "@/server/public/team";
import { normaliseSocialLinks, SOCIAL_LABELS, type SocialKind, type SocialLinks } from "@/domain/social-links";
import { decodeDataUrl } from "@/server/images";

/*
  Self-service account details (everyone, for their own account only): display name, username and
  profile picture. The account is always the session's own; no id is accepted from the page. Passwords live in users.ts (changeOwnPasswordAction) and always need the current one.
*/

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string };

const fail = (err: unknown): Result<never> => ({ ok: false, error: err instanceof UserError || (err as Error).name === "NotAuthorizedError" ? (err as Error).message : "Something went wrong. Please try again." });

function touch() {
  for (const path of ["/settings", "/players", "/team", "/overview"]) revalidatePath(path);
  revalidatePath("/", "layout");
}

export async function changeUsernameAction(username: string): Promise<Result<{ username: string }>> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    const r = await changeUsername(await getAppDb(), session.userId, username);
    touch();
    return { ok: true, data: r };
  } catch (err) {
    return fail(err);
  }
}

/** The visible name (Team, Players, profiles, cards…). The username stays as it is. */
export async function changeDisplayNameAction(displayName: string): Promise<Result<{ displayName: string }>> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    if (typeof displayName !== "string") return { ok: false, error: "Enter a display name." };
    const r = await setDisplayName(await getAppDb(), session.userId, displayName);
    touch();
    return { ok: true, data: r };
  } catch (err) {
    return fail(err);
  }
}

/**
 * The member's own YouTube, Twitch and Discord as stored, every audience included, for the Player
 * Card Studio's Links step (it loads them when it opens). Always the session's own profile.
 */
export async function ownSocialLinksAction(): Promise<Result<{ links: SocialLinks | null }>> {
  try {
    const session = await requireSession();
    if (!session.playerId) return { ok: false, error: "Social links belong to a player profile, and this account has none." };
    const links = (await loadSocialLinks(await getAppDb(), [session.playerId])).get(session.playerId) ?? null;
    return { ok: true, data: { links } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * The member's own YouTube, Twitch and Discord and who may see each (Settings, the welcome step and
 * the Player Card Studio). Always the session's own profile; every value is checked again here.
 */
export async function saveSocialLinksAction(input: Partial<Record<SocialKind, { value?: unknown; show?: unknown }>>): Promise<Result<{ links: SocialLinks | null }>> {
  try {
    const session = await requireSession();
    if (!session.playerId) return { ok: false, error: "Social links belong to a player profile, and this account has none." };
    if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
    const r = normaliseSocialLinks(input);
    if (!r.ok) return { ok: false, error: `${SOCIAL_LABELS[r.kind]}: ${r.error}` };
    await setSocialLinks(await getAppDb(), session.playerId, r.links);
    invalidatePublicTeam();
    touch();
    return { ok: true, data: { links: r.links } };
  } catch (err) {
    return fail(err);
  }
}

/** Upload a picture as a data URL (the browser has already cropped it to a 256×256 square). */
export async function uploadAvatarAction(dataUrl: string): Promise<Result<{ url: string }>> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    if (typeof dataUrl !== "string" || dataUrl.length > 600_000) return { ok: false, error: "That picture is too large (400 KB at most)." };
    const data = decodeDataUrl(dataUrl);
    if (!data) return { ok: false, error: "Use a PNG, JPEG or WebP picture." };
    const version = await setAvatar(await getAppDb(), session.userId, data);
    touch();
    return { ok: true, data: { url: `/api/avatars/${session.userId}?v=${version}` } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeAvatarAction(): Promise<Result> {
  try {
    const session = await requireSession();
    if (!session.userId) return { ok: false, error: "No account session." };
    await removeAvatar(await getAppDb(), session.userId);
    touch();
    return { ok: true, data: null };
  } catch (err) {
    return fail(err);
  }
}
