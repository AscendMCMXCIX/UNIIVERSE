import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileMatchesTab, profileHeader, type MatchSearch } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** A player's profile → Match History. */
export default async function PlayerMatchesRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<MatchSearch> }) {
  const [{ id }, session, db, sp] = await Promise.all([params, getSession(), getAppDb(), searchParams]);
  if (session?.playerId === id) redirect(`/overview/matches${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).size ? `?${new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"))}` : ""}`);
  const header = await profileHeader(db, id);
  if (!header) notFound();
  return <ProfileMatchesTab db={db} header={header} session={session} basePath={`/players/${id}`} search={sp} />;
}
