import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { profileHeader, type ProfileSearch } from "@/components/players/profile-sections";
import { ProfileOverviewTab } from "@/components/players/profile-overview-tab";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** A player's profile → Overview (read-only unless you may edit this player). */
export default async function PlayerProfileRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ProfileSearch> }) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, getSession()]);
  if (session?.playerId === id) redirect(`/overview${toQuery(sp)}`);
  await requirePageAccess("view-players");
  const db = await getAppDb();
  const header = await profileHeader(db, id);
  if (!header) notFound();
  return <ProfileOverviewTab db={db} header={header} session={session} basePath={`/players/${id}`} search={sp} />;
}

function toQuery(sp: ProfileSearch): string {
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  return q ? `?${q}` : "";
}
