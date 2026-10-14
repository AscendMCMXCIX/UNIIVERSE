import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { loadProfileHeader } from "@/server/players/profile-header";
import { ProfileHeader } from "@/components/players/profile-header";
import { ProfileTabs } from "@/components/players/profile-tabs";

export const dynamic = "force-dynamic";

/** A player's profile: header (picture, roles, rank) and two tabs, Profile and Season statistics. */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Your own profile is always yours to open; other profiles need the Players permission.
  if (session?.playerId !== id) await requirePageAccess("view-players");
  const header = await loadProfileHeader(await getAppDb(), id);
  if (!header) notFound();
  const self = session?.playerId === id;
  return (
    <div className="mx-auto max-w-5xl space-y-5" data-testid="player-profile">
      <ProfileHeader data={header} self={self} />
      <ProfileTabs playerId={id} showStats={self || hasPermission(session, "view-teammate-stats")} />
      {children}
    </div>
  );
}
