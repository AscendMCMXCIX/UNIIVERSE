import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { viewableProfileHeader } from "@/components/players/profile-sections";
import { ProfileAccountsTab } from "@/components/players/profile-accounts-tab";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** A player's profile → Riot Accounts. */
export default async function PlayerAccountsRoute({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, db] = await Promise.all([params, getSession(), getAppDb()]);
  if (session?.playerId === id) redirect("/overview/accounts");
  await requirePageAccess("view-players");
  // A personal-use profile: its player and administrators only (not found for anyone else).
  const header = await viewableProfileHeader(db, id, session);
  if (!header) notFound();
  return <ProfileAccountsTab db={db} header={header} session={session} />;
}
