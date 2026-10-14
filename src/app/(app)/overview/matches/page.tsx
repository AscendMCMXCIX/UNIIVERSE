import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileMatchesTab, profileHeader, type MatchSearch } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** My Profile → Match History. */
export default async function MyProfileMatches({ searchParams }: { searchParams: Promise<MatchSearch> }) {
  const [session, db, sp] = await Promise.all([getSession(), getAppDb(), searchParams]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileMatchesTab db={db} header={header} session={session} basePath="/overview" search={sp} />;
}
