import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getBranding } from "@/server/repositories/branding";
import { loadMatchupPage } from "@/server/matchup-intel/view";
import { riotLegal } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { MatchupFrame } from "@/components/matchup-intel/matchup-frame";
import { MatchupContent } from "@/components/matchup-intel/matchup-content";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/** One value of a parameter: a repeated one (?vs=a&vs=b) counts as none. */
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
/** Whether the address names something for a parameter (an empty one names nothing). */
const named = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim() !== "" : v !== undefined);

/**
 * RESOURCES → MATCHUP INTEL (docs/MATCHUP_INTEL.md): "I'm playing this champion against that one:
 * what do I need to know before entering lane?" A static reference for every signed-in account:
 * the two champions come from the address (?champion=<id>&vs=<id>, the champion window's names) and
 * are checked against the roster; the page reads the session, the cached roster and current patch,
 * and the stored abilities of the champions chosen, and nothing else. Branding's names come from
 * the cache the app's frame has just filled.
 */
export default async function MatchupIntelPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePageAccess();
  const [sp, db] = await Promise.all([searchParams, getAppDb()]);
  const input = { champion: one(sp.champion), vs: one(sp.vs) };
  const [{ view, champions, curated }, branding] = await Promise.all([loadMatchupPage(db, input), getBranding(db)]);
  const { you, enemy } = view;
  // A champion named in the address that is not on the roster is left out, never repeated back.
  const dropped = (named(sp.champion) && !you) || (named(sp.vs) && !enemy);
  const description = you && enemy ? `${you.name} vs ${enemy.name}: the enemy's abilities and base cooldowns, and what matters in lane.` : you ? `Playing ${you.name}: choose the enemy.` : enemy ? `Facing ${enemy.name}: the abilities and base cooldowns. Choose your champion for a curated briefing, where one exists.` : "Before lane: choose your champion and the enemy, then read the enemy's abilities, their base cooldowns and, where one exists, a curated briefing.";
  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5" data-testid="matchup-intel">
      <PageHeader title="Matchup Intel" description={description} guide />
      {dropped ? (
        <p role="status" className="rounded-panel border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-fg" data-testid="matchup-unknown">
          This address names a champion that is not on the roster, so it was left out. Choose the champion below.
        </p>
      ) : null}
      <MatchupFrame you={you} enemy={enemy} champions={champions} curated={curated}>
        <MatchupContent view={view} champions={champions} curated={curated} legal={riotLegal(branding.productName)} />
      </MatchupFrame>
    </div>
  );
}
