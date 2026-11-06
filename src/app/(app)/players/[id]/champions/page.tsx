import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { viewableProfileHeader, type ProfileSearch } from "@/components/players/profile-sections";
import { ProfileChampionsTab } from "@/components/players/profile-champions-tab";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** A player's profile → All Champions. */
export default async function PlayerChampionsRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ProfileSearch> }) {
  const [{ id }, sp, session, db] = await Promise.all([params, searchParams, getSession(), getAppDb()]);
  if (session?.playerId === id) redirect("/overview/champions");
  await requirePageAccess("view-players");
  // A personal-use profile: its player and administrators only (not found for anyone else).
  const header = await viewableProfileHeader(db, id, session);
  if (!header) notFound();
  return <ProfileChampionsTab db={db} header={header} session={session} basePath={`/players/${id}`} search={sp} />;
}
