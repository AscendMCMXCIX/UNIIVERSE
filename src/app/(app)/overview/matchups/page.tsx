import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileMatchupsTab, profileHeader } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** My Profile → Matchups. */
export default async function MyProfileMatchups({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, db, sp] = await Promise.all([getSession(), getAppDb(), searchParams]);
  const header = session?.playerId ? await profileHeader(db, session.playerId) : null;
  if (!header) return null;
  return <ProfileMatchupsTab db={db} header={header} session={session} basePath="/overview" search={sp} />;
}
