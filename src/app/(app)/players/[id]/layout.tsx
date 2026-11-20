import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { playerFreshness } from "@/server/ops/freshness";
import { FreshnessWatcher } from "@/components/ui/freshness-watcher";
import { ProfileFrame, viewableProfileHeader } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/**
 * A teammate's profile (your own opens as My Profile). Viewing it refreshes their Riot data
 * afterwards: from the mounted page's first freshness request (/api/freshness), never from this
 * render, so a prefetch of a profile (a name seen on Players) starts no Riot sync. A personal-use profile (not on the team) opens only for its player and
 * administrators: anyone else is answered "not found", here and on every tab page (each checks
 * itself, src/app/page-guards.test.ts).
 */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Your own profile lives at My Profile (one place to manage it): each tab page redirects there.
  if (session?.playerId === id) return children;
  await requirePageAccess("view-players");
  const db = await getAppDb();
  const [header, version] = await Promise.all([viewableProfileHeader(db, id, session), playerFreshness(db, id, { visit: true })]);
  if (!header) notFound();
  return (
    <ProfileFrame db={db} header={header} session={session} basePath={`/players/${id}`}>
      <FreshnessWatcher scope={{ kind: "player", playerId: id }} version={version} />
      {children}
    </ProfileFrame>
  );
}
