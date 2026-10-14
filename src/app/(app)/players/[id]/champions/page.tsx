import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileChampionsTab, profileHeader, type ProfileSearch } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** A player's profile → Champions & Roles. */
export default async function PlayerChampionsRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ProfileSearch> }) {
  const [{ id }, sp, session, db] = await Promise.all([params, searchParams, getSession(), getAppDb()]);
  if (session?.playerId === id) redirect("/overview/champions");
  const header = await profileHeader(db, id);
  if (!header) notFound();
  return <ProfileChampionsTab db={db} header={header} session={session} search={sp} />;
}
