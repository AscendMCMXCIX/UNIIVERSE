import { Suspense } from "react";
import { cookies } from "next/headers";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { hasPermission, type Session } from "@/server/auth/permissions";
import type { Db } from "@/server/db/types";
import { loadLookupPage } from "@/server/champion-lookup/view";
import { loadChampionBuilds, skillRanksOf } from "@/server/champion-builds/load";
import { behindPatch, type LookupChampion } from "@/domain/champion-lookup/view";
import { hasteFromAddress, paramOf, queueFromAddress, roleFromAddress, sourceFromAddress } from "@/components/champion-lookup/address";
import { HIGH_ELO_TEST_COOKIE, highEloShown } from "@/server/champion-builds/high-elo/switch";
import { ChampionBuilds, ChampionBuildsLoading } from "@/components/champion-lookup/champion-builds";
import { LookupView } from "@/components/champion-lookup/lookup-view";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

/**
 * CHAMPION INTEL (docs/CHAMPION_INTEL.md; Champion Lookup until 24 Nov 2026, at the same address), a
 * sidebar entry of its own (CHAMPION_INTEL, src/lib/nav.ts): choose any champion, or compare two on
 * one aligned board, and read its five abilities, their base cooldowns per rank from Riot's Data
 * Dragon and those cooldowns at an ability haste, its costs, the mechanics Riot's descriptions name,
 * its facts and base statistics, for every signed-in account; and, for accounts that may see
 * teammates' statistics, each champion's builds and runes counted in the team's stored matches
 * (LookupView's `builds`, server/champion-builds: totals only, cached, streamed in after the
 * abilities so they never wait for it; every queue's counts at once, each shown on its own). The
 * champions, hastes, builds roles and the builds' queue come from the address
 * (?champion=<id or name>&haste=<n>&role=<role>&champion2=<id or name>&haste2=<n>&role2=<role>&queue=<solo|flex|draft|clash>);
 * each champion is checked against the roster. The page reads the session, the cached roster and
 * current patch, the stored abilities of the champions chosen and their build totals: no Riot
 * request, no one player's data.
 */
/** One champion's builds, read while the rest of the page is already shown. */
async function Builds({ db, session, champion, master }: { db: Db; session: Session; champion: LookupChampion; master: boolean }) {
  const views = await loadChampionBuilds(db, session, { championId: champion.champion.id, championName: champion.champion.name, ranks: skillRanksOf(champion.abilities) }, { master });
  return views ? <ChampionBuilds views={views} /> : null;
}

export default async function ChampionIntelPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePageAccess();
  const [sp, db] = await Promise.all([searchParams, getAppDb()]);
  const page = await loadLookupPage(db, { champion: paramOf(sp.champion), champion2: paramOf(sp.champion2) });
  const { lookup, second, currentPatch } = page;
  // A second champion with no first (or a first the roster lacks) is the first: its haste goes with it.
  const haste = hasteFromAddress(page.firstFrom === "champion2" ? sp.haste2 : sp.haste);
  const haste2 = hasteFromAddress(sp.haste2);
  // Builds need the game's current patch, and the right to see teammates' statistics (the team's
  // own games are among them); a champion whose abilities are not stored has none either.
  const withBuilds = !!currentPatch && hasPermission(session, "view-teammate-stats");
  // The Master+ source (docs/HIGH_ELO_EVIDENCE.md): offered only while its collection is on, or with the browser tests' cookie on the in-memory demo.
  const master = withBuilds && highEloShown((await cookies()).get(HIGH_ELO_TEST_COOKIE)?.value ?? null);
  const buildsOf = (c: LookupChampion | null) =>
    withBuilds && c?.abilities ? (
      <Suspense fallback={<ChampionBuildsLoading />}>
        <Builds db={db} session={session} champion={c} master={master} />
      </Suspense>
    ) : undefined;
  const roles: [ReturnType<typeof roleFromAddress>, ReturnType<typeof roleFromAddress>] = [roleFromAddress(page.firstFrom === "champion2" ? sp.role2 : sp.role), second ? roleFromAddress(sp.role2) : null];
  const shown = lookup;
  const source = shown?.version ? `Riot Data Dragon ${shown.version}${shown.patch ? ` · patch ${shown.patch}` : ""}${shown.offline ? " · offline copy" : ""}` : null;
  const behind = shown ? behindPatch(shown.patch, currentPatch) : false;
  return (
    // A word too long for its whole line breaks rather than reach past its box (a phone at a large text
    // size); a word that fits is never broken (break-words, not "anywhere": names stay whole).
    // Two champions take the wide page (100rem), so each column keeps its ranks in columns on a large screen.
    <div className={cn("mx-auto break-words", second ? "max-w-[var(--content-wide)]" : "max-w-[var(--content-max)]")} data-testid="champion-lookup">
      <LookupView
        champions={page.champions}
        lookup={lookup}
        second={second}
        initialHaste={haste}
        initialHaste2={second ? haste2 : 0}
        initialRoles={roles}
        initialQueue={queueFromAddress(sp.queue)}
        initialSource={master ? sourceFromAddress(sp.source) : "team"}
        builds={{ first: buildsOf(lookup), second: buildsOf(second) }}
        dropped={page.dropped}
        source={
          source ? (
            <>
              <span>{source}</span>
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
