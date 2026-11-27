import { Suspense } from "react";
import { cookies } from "next/headers";
import { getAppDb } from "@/server/bootstrap";
import { requirePageAccess } from "@/server/auth/page-access";
import { hasPermission, type Session } from "@/server/auth/permissions";
import type { Db } from "@/server/db/types";
import { loadLookupPage } from "@/server/champion-lookup/view";
import { loadChampionBuilds, skillRanksOf } from "@/server/champion-builds/load";
import { behindPatch, type LookupChampion } from "@/domain/champion-lookup/view";
import { loadLaneEvidence } from "@/server/matchup/lane-evidence";
import { notesForPair } from "@/server/matchup/notes-store";
import { KIT_CHANGED_TEST_COOKIE, NOTE_AGE_TEST_COOKIE, kitChangedForTest, noteAgeForTest } from "@/server/demo/test-hooks";
import { earlyKitLines, kitChange } from "@/domain/matchup/early-kit";
import type { Role } from "@/domain/roles";
import { hasteFromAddress, laneFromAddress, paramOf, queueFromAddress, roleFromAddress } from "@/components/champion-lookup/address";
import { ChampionBuilds, ChampionBuildsLoading } from "@/components/champion-lookup/champion-builds";
import { LookupView } from "@/components/champion-lookup/lookup-view";
import { MatchupBand } from "@/components/champion-lookup/matchup-band";
import { MatchupBandLoading } from "@/components/champion-lookup/matchup-band-loading";
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
 * abilities so they never wait for it). The champions, hastes and builds roles come from the
 * address (?champion=<id or name>&haste=<n>&role=<role>&champion2=<id or name>&haste2=<n>&role2=<role>);
 * each champion is checked against the roster. With two champions and a lane (&lane=TOP…), MATCHUP
 * INTEL's early-lane band (docs/MATCHUP_INTEL.md) is streamed above the board the same way: Riot's
 * level-1 differences, the team's lane figures at 10:00 for accounts that may see teammates'
 * statistics, and the reviewed notes; the page's queue (&queue=flex…) chooses whose figures show.
 * The page reads the session, the cached roster and current patch, the stored abilities of the
 * champions chosen, their build totals and the pair's lane totals and notes: no Riot request, no
 * one player's data.
 */
/** One champion's builds, read while the rest of the page is already shown. */
async function Builds({ db, session, champion }: { db: Db; session: Session; champion: LookupChampion }) {
  const view = await loadChampionBuilds(db, session, { championId: champion.champion.id, championName: champion.champion.name, ranks: skillRanksOf(champion.abilities) });
  return view ? <ChampionBuilds view={view} /> : null;
}

/** Matchup Intel's band for the two champions in a lane, read while the rest of the page is already shown. */
async function Matchup({ db, session, a, b, role, test }: { db: Db; session: Session; a: LookupChampion; b: LookupChampion; role: Role; test: { ageDistance: number | null; kitChanged: boolean } }) {
  const [evidence, notes] = await Promise.all([
    loadLaneEvidence(db, session, { a: { id: a.champion.id, name: a.champion.name }, b: { id: b.champion.id, name: b.champion.name }, role }),
    notesForPair(db, { role, championId: a.champion.id, opponentId: b.champion.id }, test),
  ]);
  const changes = [kitChange(a), kitChange(b)].filter((c): c is NonNullable<typeof c> => !!c);
  return <MatchupBand data={{ role, a: { id: a.champion.id, name: a.champion.name }, b: { id: b.champion.id, name: b.champion.name }, patch: a.patch, kit: { lines: earlyKitLines(a, b), changes }, evidence, notes }} />;
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
  const buildsOf = (c: LookupChampion | null) =>
    withBuilds && c?.abilities ? (
      <Suspense fallback={<ChampionBuildsLoading />}>
        <Builds db={db} session={session} champion={c} />
      </Suspense>
    ) : undefined;
  const roles: [ReturnType<typeof roleFromAddress>, ReturnType<typeof roleFromAddress>] = [roleFromAddress(page.firstFrom === "champion2" ? sp.role2 : sp.role), second ? roleFromAddress(sp.role2) : null];
  // Matchup Intel: a lane only with two champions; the queue is the page's (Ranked Solo/Duo by default).
  const lane = lookup && second ? laneFromAddress(sp.lane) : null;
  const queue = queueFromAddress(sp.queue);
  let matchup: React.ReactNode = undefined;
  if (lookup && second && lane) {
    const jar = await cookies();
    const test = { ageDistance: noteAgeForTest(jar.get(NOTE_AGE_TEST_COOKIE)?.value), kitChanged: kitChangedForTest(jar.get(KIT_CHANGED_TEST_COOKIE)?.value) };
    matchup = (
      <Suspense fallback={<MatchupBandLoading blocks={hasPermission(session, "view-teammate-stats") ? 3 : 2} />}>
        <Matchup db={db} session={session} a={lookup} b={second} role={lane} test={test} />
      </Suspense>
    );
  }
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
        initialLane={lane}
        initialQueue={queue}
        matchup={matchup}
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
