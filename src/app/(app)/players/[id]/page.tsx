import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { loadProfileHeader } from "@/server/players/profile-header";
import { PlayerProfilePage, type ProfileSearch } from "@/components/players/player-profile-page";

export const dynamic = "force-dynamic";

/** A player's profile: the shared profile layout, read-only unless you may edit this player. */
export default async function PlayerProfileRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ProfileSearch> }) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, getSession()]);
  // Your own profile lives at My Profile (one place to manage it).
  if (session?.playerId === id) redirect(`/overview${toQuery(sp)}`);
  const db = await getAppDb();
  const header = await loadProfileHeader(db, id);
  if (!header) notFound();
  return <PlayerProfilePage db={db} header={header} session={session} basePath={`/players/${id}`} search={sp} />;
}

function toQuery(sp: ProfileSearch): string {
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  return q ? `?${q}` : "";
}
