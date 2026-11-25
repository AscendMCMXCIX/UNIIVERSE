import { redirect } from "next/navigation";
import { legacyMatchupRedirect } from "@/components/champion-lookup/address";

export const dynamic = "force-dynamic";

/**
 * Matchup Intel's address (retired 23 Nov 2026 for Champion Intel): every old link lands on
 * Champion Intel, carrying one champion (the enemy, `vs`, where it names one: legacyMatchupRedirect).
 * The proxy answers it first, with an HTTP 308 (src/proxy.ts); this page is the fallback should a
 * request ever reach it. Champion Intel checks who may open it, as every page does.
 */
export default async function MatchupIntelMoved({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(legacyMatchupRedirect(await searchParams));
}
