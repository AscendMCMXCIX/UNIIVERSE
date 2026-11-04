import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { profileHeader } from "@/components/players/profile-sections";
import { ProfileMatchesTab, type MatchSearch } from "@/components/players/profile-matches-tab";
import { requirePageAccess } from "@/server/auth/page-access";

export const dynamic = "force-dynamic";

/** A player's profile → Match History. */
export default async function PlayerMatchesRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<MatchSearch> }) {
  const [{ id }, session, db, sp] = await Promise.all([params, getSession(), getAppDb(), searchParams]);
  if (session?.playerId === id) redirect(`/overview/matches${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).size ? `?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))}` : ""}`);
  await requirePageAccess("view-players");
  const header = await profileHeader(db, id);
  if (!header) notFound();
  return <ProfileMatchesTab db={db} header={header} session={session} basePath={`/players/${id}`} search={sp} />;
}
