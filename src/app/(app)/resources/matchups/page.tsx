import { cookies } from "next/headers";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { getBranding } from "@/server/repositories/branding";
import { loadMatchupPage } from "@/server/matchup-intel/view";
import { RIOT_TEXT_TEST_COOKIE, riotTextFactsShown } from "@/server/matchup-intel/riot-text/switch";
import { riotLegal } from "@/components/app-shell";
import { MatchupFrame } from "@/components/matchup-intel/matchup-frame";
import { MatchupContent } from "@/components/matchup-intel/matchup-content";
import { MatchupStatus } from "@/components/matchup-intel/matchup-status";
import { briefingShows } from "@/components/matchup-intel/briefing";
import { announcementWords } from "@/components/matchup-intel/wording";
import { DUO_ROLES } from "@/domain/matchup-intel/types";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/** One value of a parameter: the first of a repeated one (?vs=a&vs=b reads a), as a link's own parameter would be. */
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined);
/** Whether the address names something for a parameter (an empty one names nothing). */
const named = (v: string | string[] | undefined) => (one(v) ?? "").trim() !== "";

/**
 * MATCHUP INTEL (docs/MATCHUP_INTEL.md), a sidebar entry of its own at the address it had as one of
 * Resources' sections (MATCHUP_INTEL, src/lib/nav.ts): "I'm playing this champion against that one:
 * what do I need to know before entering lane?" A static reference for every signed-in account:
 * the two champions come from the address (?champion=<id>&vs=<id>, the champion window's names) and
 * are checked against the roster; the page reads the session, the cached roster, current patch and
 * list of patches, and the stored abilities of the champions chosen, and nothing else. Branding's
 * names come from the cache the app's frame has just filled.
 */
export default async function MatchupIntelPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePageAccess();
  const [sp, db, jar] = await Promise.all([searchParams, getAppDb(), cookies()]);
  const input = { role: one(sp.role), champion: one(sp.champion), vs: one(sp.vs), ally: one(sp.ally), vs2: one(sp.vs2) };
  // The facts from Riot's text only while their switch is on (riot-text/switch.ts; a browser test's cookie on the demo).
  const riotText = riotTextFactsShown(jar.get(RIOT_TEXT_TEST_COOKIE)?.value);
  const [{ view, champions, curated }, branding] = await Promise.all([loadMatchupPage(db, input, riotText), getBranding(db)]);
  const { you, enemy, ally, enemy2, role } = view;
  const duo = DUO_ROLES.has(role);
  // A champion named in the address that is not on the roster is left out, never repeated back.
  const dropped = (named(sp.champion) && !you) || (named(sp.vs) && !enemy) || (duo && named(sp.ally) && !ally) || (duo && named(sp.vs2) && !enemy2);
  // "What matters in lane" only where a briefing will show a point of its own.
  const shows = briefingShows(view.matchup);
  const lane = shows ? ", and what matters in lane" : view.matchup ? "; its curated briefing is hidden, so each champion's own facts follow" : "; no curated briefing yet, so each champion's own facts follow";
  const description = you && enemy ? `${you.name} vs ${enemy.name}: the enemy's abilities and base cooldowns${lane}.` : you ? `Playing ${you.name}: choose the enemy.` : enemy ? `Facing ${enemy.name}: the abilities and base cooldowns. Choose your champion for a curated briefing where one exists, or both champions' facts side by side.` : "Choose your champion and the enemy, then read the enemy's abilities, their base cooldowns and crowd control, and what matters in lane.";
  return (
    // A word too long for its line breaks rather than reach past its box (inherited by all the page
    // holds): only at a larger text size on a narrow phone, as at 200% on a 320px one. The title is
    // in the picker bar, with the patch and how fresh the page is, so the dashboard starts high.
    <div className="mx-auto max-w-[var(--content-wide)] space-y-3 [overflow-wrap:anywhere]" data-testid="matchup-intel">
      {dropped ? (
        <p role="status" className="rounded-panel border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-fg" data-testid="matchup-unknown">
          This address names a champion that is not on the roster, so it was left out. Choose the champion below.
        </p>
      ) : null}
      <MatchupFrame
        role={role}
        roleInAddress={named(sp.role)}
        you={you}
        enemy={enemy}
        ally={ally}
        enemy2={enemy2}
        champions={champions}
        curated={curated}
        announcement={announcementWords(view, shows)}
        heading={
          <header>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Matchup Intel</h1>
            <p className="sr-only" data-testid="matchup-description">
              {description}
            </p>
          </header>
        }
        patchState={<MatchupStatus view={view} />}
      >
        <MatchupContent view={view} champions={champions} curated={curated} legal={riotLegal(branding.productName)} />
      </MatchupFrame>
    </div>
  );
}
