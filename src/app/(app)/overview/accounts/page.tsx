import { getAppDb } from "@/server/bootstrap";
import { profileHeader } from "@/components/players/profile-sections";
import { ProfileAccountsTab } from "@/components/players/profile-accounts-tab";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** My Profile → Riot Accounts. */
export default async function MyProfileAccounts() {
  const [session, db] = await Promise.all([requirePageAccess(), getAppDb()]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileAccountsTab db={db} header={header} session={session} />;
}
