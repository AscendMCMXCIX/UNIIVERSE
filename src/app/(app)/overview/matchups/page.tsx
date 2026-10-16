import { redirect } from "next/navigation";
import { matchupsRedirect } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** Matchups now live in All Champions → a champion → Matchups; old links land there, filters kept. */
export default async function MyProfileMatchups({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(matchupsRedirect("/overview", await searchParams));
}
