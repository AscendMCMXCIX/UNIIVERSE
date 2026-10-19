import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/types";
import { appSettings } from "@/server/db/schema";

/*
  PUBLIC / GUEST VIEW: the switches.

  - The team-wide switch (Admin → Public Access) decides whether visitors without an account can
    open the public pages at all. Off until an admin turns it on.
  - Each member's own consent (players.public_profile, Settings → Public profile) decides whether
    their identity appears there. Off until they turn it on; the team switch never overrides it.
  - Riot-derived figures (rank, statistics, leaderboards) stay off the public
    pages unless the deployment sets UNIIVERSE_PUBLIC_RIOT_DATA=true. Riot does not allow an app on
    a Personal API key to serve its data for public consumption; set it only once the product holds
    a Production key and its registration describes the public pages.
*/

const KEY = "public_access";

export interface PublicAccess {
  enabled: boolean;
}

export async function getPublicAccess(db: Db): Promise<PublicAccess> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
  const value = row?.value as { enabled?: unknown } | undefined;
  // Anything but an explicit true is off.
  return { enabled: value?.enabled === true };
}

export async function setPublicAccess(db: Db, enabled: boolean): Promise<void> {
  const value = { enabled: enabled === true };
  await db.insert(appSettings).values({ key: KEY, value, updatedAt: new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}

/** Whether Riot-derived figures may appear on public pages (deployment setting; off by default). */
export function publicRiotDataAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return (env.UNIIVERSE_PUBLIC_RIOT_DATA ?? "").trim().toLowerCase() === "true";
}
