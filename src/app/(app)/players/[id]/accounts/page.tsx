import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { profileHeader } from "@/components/players/profile-sections";
import { ProfileAccountsTab } from "@/components/players/profile-accounts-tab";

export const dynamic = "force-dynamic";

/** A player's profile → Riot Accounts. */
export default async function PlayerAccountsRoute({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session, db] = await Promise.all([params, getSession(), getAppDb()]);
  if (session?.playerId === id) redirect("/overview/accounts");
  const header = await profileHeader(db, id);
  if (!header) notFound();
  return <ProfileAccountsTab db={db} header={header} session={session} />;
}
