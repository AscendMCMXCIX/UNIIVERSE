import { getAppDb } from "@/server/bootstrap";
import { profileHeader } from "@/components/players/profile-sections";
import { ProfileMatchesTab, type MatchSearch } from "@/components/players/profile-matches-tab";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** My Profile → Match History. */
export default async function MyProfileMatches({ searchParams }: { searchParams: Promise<MatchSearch> }) {
  const [session, db, sp] = await Promise.all([requirePageAccess(), getAppDb(), searchParams]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileMatchesTab db={db} header={header} session={session} basePath="/overview" search={sp} />;
}
