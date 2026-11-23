import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { loadLookupPage } from "@/server/champion-lookup/view";
import { behindPatch } from "@/domain/champion-lookup/view";
import { hasteFromAddress } from "@/components/champion-lookup/address";
import { LookupView } from "@/components/champion-lookup/lookup-view";
import { PAGE_TITLE } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/** One value of a parameter: the first of a repeated one. */
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : undefined);

/**
 * CHAMPION LOOKUP (docs/CHAMPION_LOOKUP.md), a sidebar entry of its own (CHAMPION_LOOKUP,
 * src/lib/nav.ts): choose any champion and read its five abilities, their base cooldowns per rank
 * from Riot's Data Dragon and those cooldowns at an ability haste. For every signed-in account. The
 * champion and the haste come from the address (?champion=<id or name>&haste=<n>); the champion is
 * checked against the roster. The page reads the session, the cached roster and current patch, and
 * the stored abilities of the one champion chosen, and nothing else: no Riot request, no player data.
 */
export default async function ChampionLookupPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePageAccess();
  const [sp, db] = await Promise.all([searchParams, getAppDb()]);
  const page = await loadLookupPage(db, { champion: one(sp.champion) });
  const { lookup, currentPatch } = page;
  const source = lookup?.version ? `Riot Data Dragon ${lookup.version}${lookup.patch ? ` · patch ${lookup.patch}` : ""}${lookup.offline ? " · offline copy" : ""}` : null;
  const behind = lookup ? behindPatch(lookup.patch, currentPatch) : false;
  return (
    // A word too long for its line breaks rather than reach past its box: only at a larger text size on a narrow phone.
    <div className="mx-auto max-w-[var(--content-max)] space-y-3 [overflow-wrap:anywhere]" data-testid="champion-lookup">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className={PAGE_TITLE}>Champion Lookup</h1>
        <p className="text-xs text-fg-muted" data-testid="lookup-source">
          {source ? (
            <>
              <span className="font-medium text-fg">{source}</span>
              {behind ? <span className="text-warn"> · the game is on patch {currentPatch}</span> : null}
            </>
          ) : (
            <>Abilities and cooldowns from Riot&apos;s Data Dragon{currentPatch ? <> · patch {currentPatch}</> : null}</>
          )}
        </p>
      </header>
      {page.dropped ? (
        <p role="status" className="rounded-panel border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-fg" data-testid="lookup-unknown">
          This address names a champion that is not on the roster, so it was left out. Choose one below.
        </p>
      ) : null}
      <LookupView champions={page.champions} lookup={lookup} initialHaste={hasteFromAddress(sp.haste)} />
    </div>
  );
}
