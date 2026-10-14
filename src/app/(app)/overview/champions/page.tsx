import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileChampionsTab, profileHeader, type ProfileSearch } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** My Profile → Champions & Roles. */
export default async function MyProfileChampions({ searchParams }: { searchParams: Promise<ProfileSearch> }) {
  const [sp, session, db] = await Promise.all([searchParams, getSession(), getAppDb()]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileChampionsTab db={db} header={header} session={session} basePath="/overview" search={sp} />;
}
