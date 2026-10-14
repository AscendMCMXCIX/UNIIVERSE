import { after } from "next/server";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { refreshPlayerAccountsIfDue } from "@/server/accounts/kickoff";

export const dynamic = "force-dynamic";

/** A teammate's profile (your own opens as My Profile). Viewing it refreshes their Riot data afterwards. */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // Your own profile is always yours to open; other profiles need the Players permission.
  if (session?.playerId !== id) await requirePageAccess("view-players");
  const db = await getAppDb();
  // Bounded, after the page is sent (see the function).
  after(() => refreshPlayerAccountsIfDue(db, id));
  return children;
}
