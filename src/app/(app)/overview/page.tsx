import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { profileHeader, type ProfileSearch } from "@/components/players/profile-sections";
import { ProfileOverviewTab } from "@/components/players/profile-overview-tab";

export const dynamic = "force-dynamic";

/** My Profile → Overview. */
export default async function MyProfileOverview({ searchParams }: { searchParams: Promise<ProfileSearch> }) {
  const [sp, session, db] = await Promise.all([searchParams, getSession(), getAppDb()]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileOverviewTab db={db} header={header} session={session} basePath="/overview" search={sp} />;
}
