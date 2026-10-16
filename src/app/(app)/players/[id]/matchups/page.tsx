import { notFound, redirect } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getSession } from "@/server/auth/session";
import { ProfileMatchupsTab, profileHeader } from "@/components/players/profile-sections";

export const dynamic = "force-dynamic";

/** A player's profile → Matchups. */
export default async function PlayerMatchupsRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, session, db, sp] = await Promise.all([params, getSession(), getAppDb(), searchParams]);
  if (session?.playerId === id) {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    redirect(`/overview/matchups${q.size ? `?${q}` : ""}`);
  }
  const header = await profileHeader(db, id);
  if (!header) notFound();
  return <ProfileMatchupsTab db={db} header={header} session={session} basePath={`/players/${id}`} search={sp} />;
}
