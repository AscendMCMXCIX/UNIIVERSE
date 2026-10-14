import { notFound } from "next/navigation";
import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";
import { ProfileFrame, profileHeader } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** A teammate's profile (your own opens as My Profile). Viewing it refreshes their Riot data afterwards. */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Your own profile lives at My Profile (one place to manage it): each tab page redirects there.
  if (session?.playerId === id) return children;
  await requirePageAccess("view-players");
  const db = await getAppDb();
  const header = await profileHeader(db, id);
  if (!header) notFound();
  // Bounded, after the page is sent (see the function).
  after(() => refreshPlayerAccountsIfDue(db, id));
  return (
    <ProfileFrame db={db} header={header} session={session} basePath={`/players/${id}`}>
      {children}
    </ProfileFrame>
  );
}
