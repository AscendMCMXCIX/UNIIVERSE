import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { loadLookupPage } from "@/server/champion-lookup/view";
import { behindPatch } from "@/domain/champion-lookup/view";
import { hasteFromAddress, paramOf } from "@/components/champion-lookup/address";
import { LookupView } from "@/components/champion-lookup/lookup-view";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/**
 * CHAMPION INTEL (docs/CHAMPION_INTEL.md; Champion Lookup until 24 Nov 2026, at the same address), a
 * sidebar entry of its own (CHAMPION_INTEL, src/lib/nav.ts): choose any champion, or two side by
 * side, and read its five abilities, their base cooldowns per rank from Riot's Data Dragon and those
 * cooldowns at an ability haste, its costs, key mechanics and base statistics. For every signed-in
 * account. The champions and hastes come from the address
 * (?champion=<id or name>&haste=<n>&champion2=<id or name>&haste2=<n>); each champion is checked
 * against the roster. The page reads the session, the cached roster and current patch, and the
 * stored abilities of the champions chosen, and nothing else: no Riot request, no player data.
 */
export default async function ChampionIntelPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePageAccess();
  const [sp, db] = await Promise.all([searchParams, getAppDb()]);
  const page = await loadLookupPage(db, { champion: paramOf(sp.champion), champion2: paramOf(sp.champion2) });
  const { lookup, second, currentPatch } = page;
  // A second champion with no first (or a first the roster lacks) is the first: its haste goes with it.
  const haste = hasteFromAddress(page.firstFrom === "champion2" ? sp.haste2 : sp.haste);
  const haste2 = hasteFromAddress(sp.haste2);
  const shown = lookup;
  const source = shown?.version ? `Riot Data Dragon ${shown.version}${shown.patch ? ` · patch ${shown.patch}` : ""}${shown.offline ? " · offline copy" : ""}` : null;
  const behind = shown ? behindPatch(shown.patch, currentPatch) : false;
  return (
    // A word too long for its line breaks rather than reach past its box: only at a larger text size on a narrow phone.
    // Two champions take the wide page (100rem), so each panel keeps its ranks in columns on a large screen.
    <div className={cn("mx-auto [overflow-wrap:anywhere]", second ? "max-w-[var(--content-wide)]" : "max-w-[var(--content-max)]")} data-testid="champion-lookup">
      <LookupView
        champions={page.champions}
        lookup={lookup}
        second={second}
        initialHaste={haste}
        initialHaste2={second ? haste2 : 0}
        dropped={page.dropped}
        source={
          source ? (
            <>
              <span className="font-medium text-fg">{source}</span>
              {behind ? <span className="text-warn"> · the game is on patch {currentPatch}</span> : null}
            </>
          ) : (
            <>Abilities and cooldowns from Riot&apos;s Data Dragon{currentPatch ? <> · patch {currentPatch}</> : null}</>
          )
        }
      />
    </div>
  );
}
