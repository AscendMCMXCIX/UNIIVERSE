import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileAccountsTab, profileHeader } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** My Profile → Riot Accounts. */
export default async function MyProfileAccounts() {
  const [session, db] = await Promise.all([getSession(), getAppDb()]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileAccountsTab db={db} header={header} session={session} />;
}
