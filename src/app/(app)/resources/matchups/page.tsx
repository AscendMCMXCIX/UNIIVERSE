import { redirect } from "next/navigation";
import { legacyMatchupRedirect } from "@/components/champion-lookup/address";

export const dynamic = "force-dynamic";

/**
 * Matchup Intel's address (retired 23 Nov 2026 for Champion Lookup): every old link lands on
 * Champion Lookup, carrying one champion (the enemy, `vs`, where it names one: legacyMatchupRedirect).
 * Champion Lookup checks who may open it, as every page does.
 */
export default async function MatchupIntelMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyMatchupRedirect(await searchParams));
}
