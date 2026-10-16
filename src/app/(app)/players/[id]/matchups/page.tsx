import { redirect } from "next/navigation";
import { matchupsRedirect } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** Matchups now live in All Champions → a champion → Matchups; old links land there, filters kept. */
export default async function PlayerMatchupsRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  redirect(matchupsRedirect(`/players/${id}`, sp));
}
