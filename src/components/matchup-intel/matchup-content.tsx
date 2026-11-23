import { History, Swords } from "lucide-react";
import { DUO_ROLES, type ChampionChoice, type ChampionIntelView, type MatchupPageView } from "@/domain/matchup-intel/types";
import { EmptyState } from "@/components/ui/empty-state";
import { AbilitiesPanel, YourChampion, abilityPeekItemsOf } from "./ability-list";
import { AbilityPeekProvider } from "./ability-peek";
import { Fold } from "@/components/ui/fold";
import { kitOf } from "@/domain/matchup-intel/kit";
import { AssembledReference } from "./assembled";
import { Briefing, CuratedLinks, PAIR_CHIP, briefingShows } from "./briefing";
import { MatchupFooter } from "./matchup-footer";
import { OpenPickerButton, PairLink } from "./matchup-frame";
import { slotWords } from "./slots";
import { RiotTipsPanel } from "./riot-tips";
import { EvidenceBody, EvidenceSummary } from "./evidence-panel";
import type { MatchupEvidence } from "@/domain/matchup-intel/evidence";
import { InteractionsPanel, LevelNotesPanel, notesBalance } from "./matchup-notes";
import { behindOf } from "./matchup-status";
import { FULL_REFERENCE_TITLE, fullReferenceWords, staleDataWords } from "./wording";
import type { MeansAbility } from "@/domain/matchup-intel/haste";
import type { AbilityRef } from "@/domain/matchup-intel/types";

/** The enemy's abilities by their ref ("Darius.E"), for the briefing rows' "what it means" lines; none without stored abilities. */
function meansOf(intel: ChampionIntelView | null): Partial<Record<AbilityRef, MeansAbility>> | undefined {
  if (!intel?.abilities) return undefined;
  return Object.fromEntries(intel.abilities.map((a) => [`${intel.champion.id}.${a.slot}`, { champion: intel.champion.name, slot: a.slot, basis: a.haste }]));
}

/*
  MATCHUP INTEL's page body, under the picker bar (docs/MATCHUP_INTEL.md, "The lane plan"; the owner's
  redesign request of 23 Nov 2026: a player picks the matchup and understands what matters within
  5 to 10 seconds). One column at every width, in the order it is read:
    1. the lane plan: the curated briefing where one shows (threat, opportunity, lane points, and
       beside them the level changes and the matchup's own interactions), else the lane reference
       (each champion's own facts by kind, the enemy's as danger and yours as opportunity, and Riot's
       own first tip against the enemy), in readable type, where it comes from in one quiet line;
    2. the enemy's abilities as a strip, P to R side by side on a desktop (one under another on a
       phone), each base cooldown large with the crowd control and other key facts under it, each
       opening the ability's whole reference in a Peek (?ability=); in the bot lane both enemies' strips;
    3. the sources and notices, their summary always on the page (directly under the strips, so a
       desktop's first screen keeps it), the rest one press away;
    4. the full reference, one press away: the notes the plan does not hold, your side's kits, Riot's
       tips and the evidence from the team's games.
  With nothing chosen, or one side only, it says what to do next.
*/

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const toChoices = (ids: readonly string[] | undefined, byId: ReadonlyMap<string, ChampionChoice>) => (ids ?? []).map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);

/** Nothing chosen: what the page does, and the curated briefings there are so far. */
function NothingChosen({ curated, byId }: { curated: Record<string, string[]>; byId: ReadonlyMap<string, ChampionChoice> }) {
  const pairs = Object.entries(curated).flatMap(([you, enemies]) => {
    const a = byId.get(you);
    return a ? toChoices(enemies, byId).map((b) => ({ you: a, enemy: b })) : [];
  });
  return (
    // A phone's narrower padding: at twice the text size on a 320px phone, the words and the pairs keep whole.
    <EmptyState icon={Swords} title="Choose your champion and the enemy" action={<OpenPickerButton slot="you" testId="matchup-start">Choose your champion</OpenPickerButton>} testId="matchup-empty" className="max-sm:px-3">
      <p>Then read the enemy&apos;s abilities with their base cooldowns and crowd control, and what matters in lane: a curated briefing where one exists, otherwise each champion&apos;s own facts side by side.</p>
      {pairs.length ? (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5 pointer-coarse:gap-y-2" data-testid="matchup-curated-pairs">
          <span>Curated briefings so far:</span>
          {pairs.map(({ you, enemy }) => (
            <PairLink key={`${you.id}-${enemy.id}`} you={you.id} enemy={enemy.id} className={PAIR_CHIP} testId="matchup-curated-pair">
              {you.name} vs {enemy.name}
            </PairLink>
          ))}
        </p>
      ) : null}
    </EmptyState>
  );
}

/** Ability data older than the game's current patch: said once, above the abilities, naming whose. */
function StaleNote({ words }: { words: string }) {
  return (
    <p className="flex items-start gap-2 border-b border-warn/30 bg-warn/10 px-3 py-2 text-xs text-fg" data-testid="matchup-stale">
      <History className="mt-px h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
      <span>{words}</span>
    </p>
  );
}

/**
 * The full reference's notes: beside a lane plan, each champion's own interactions and exceptions
 * (the plan holds the matchup's own and the level changes); for a pair with no plan, the interactions
 * and the level changes side by side where there is room, the fuller the wider (notesBalance).
 */
const NOTES_SPLIT = {
  interactions: "@min-[40rem]/dash:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]",
  even: "@min-[40rem]/dash:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]",
  levels: "@min-[40rem]/dash:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]",
  // The interactions only each champion's folded line: a third is room enough for it.
  folds: "@min-[40rem]/dash:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
} as const;

export function MatchupContent({ view, champions, curated, legal, evidence = null, peekInitial = null }: { view: MatchupPageView; champions: readonly ChampionChoice[]; curated: Record<string, string[]>; legal: string; evidence?: MatchupEvidence | null; /** The ability the address names (`?ability=`), open in its Peek as the page arrives. */ peekInitial?: string | null }) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const { you, enemy, enemyIntel, yourIntel, matchup, role, allyIntel, enemy2Intel } = view;
  const duo = DUO_ROLES.has(role);
  const curatedForYou = you ? toChoices(curated[you.id], byId) : [];
  const mirror = !!you && !!enemy && you.id === enemy.id;
  const current = view.patch.current;
  const shownData = [enemyIntel, mirror ? null : yourIntel, enemy2Intel, allyIntel].filter((i) => !!i?.abilities);
  const behind = behindOf(view);
  // The champions whose ability tiles are on the page (yours folded, but there), for the chips.
  const rows = new Set(shownData.map((i) => i!.champion.id));
  const stale = behind.length && current ? <StaleNote words={staleDataWords(behind, current, behind.length === shownData.length)} /> : null;
  const shows = briefingShows(matchup);
  const balance = enemyIntel ? notesBalance(matchup, enemyIntel, yourIntel) : "even";
  // Every ability on the page opens its whole reference in one Peek, the enemies' first (the order ↑/↓ step through).
  const peekItems = [enemyIntel, enemy2Intel, mirror ? null : yourIntel, allyIntel].flatMap((i) => (i?.abilities ? abilityPeekItemsOf(i) : []));
  // Your side's kits, folded: in the bot lane your duo's two side by side where there is room.
  const yourKits = [yourIntel && !mirror ? { intel: yourIntel, label: duo ? slotWords(role, "you").label : undefined, testId: undefined } : null, allyIntel ? { intel: allyIntel, label: slotWords(role, "ally").label, testId: "matchup-ally-abilities" } : null].filter((k): k is NonNullable<typeof k> => !!k);
  const yours = yourKits.length ? (
    <div className={yourKits.length > 1 ? "grid gap-3 @min-[48rem]/dash:grid-cols-2 @min-[48rem]/dash:items-start" : undefined} data-testid={duo ? "matchup-duo-kits" : undefined}>
      {yourKits.map((k) => (
        <YourChampion key={k.intel.champion.id} intel={k.intel} label={k.label} testId={k.testId} foldSources={yourKits.length > 1} />
      ))}
    </div>
  ) : null;
  // Riot's tips and the evidence from the team's games share one fold, its line stating both.
  const tipsShown = [enemyIntel, enemy2Intel, mirror ? null : yourIntel, allyIntel].some((i) => !!i);
  const tips = <RiotTipsPanel enemies={[enemyIntel, enemy2Intel].filter((i): i is ChampionIntelView => !!i)} yours={[mirror ? null : yourIntel, allyIntel].filter((i): i is ChampionIntelView => !!i)} evidenceSummary={<EvidenceSummary evidence={evidence} />} evidence={<EvidenceBody evidence={evidence} duo={duo} pair={{ chosen: !!you && !!enemy, curated: shows, hidden: !shows && !!matchup }} />} />;
  const plan = !!you && !!enemy;
  // Beside a lane plan the plan holds the level changes and the matchup's own interactions; the full
  // reference then holds each champion's own interactions and exceptions, where any are recorded.
  const championInteractions = !!enemyIntel && [enemyIntel, mirror ? null : yourIntel].some((i) => !!i && kitOf(i).interactions.length > 0);
  const notes = enemyIntel ? (
    shows ? (
      championInteractions ? (
        <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} yourIntel={yourIntel} you={you} rows={rows} parts="champions" />
      ) : null
    ) : (
      // Side by side where the column has room, the fuller of the two the wider.
      <div className={`grid gap-3 @min-[40rem]/dash:items-start ${NOTES_SPLIT[balance]}`} data-testid="matchup-notes" data-balance={balance}>
        <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} yourIntel={yourIntel} you={you} rows={rows} />
        <LevelNotesPanel intels={[enemyIntel, yourIntel]} />
      </div>
    )
  ) : null;
  const referenceWords = fullReferenceWords({
    interactions: shows ? championInteractions : true,
    levels: !shows,
    yours: yourKits.map((k) => k.intel.champion.name),
    tips: tipsShown,
  });

  return (
    <AbilityPeekProvider items={peekItems} initial={peekInitial}>
      {/* On a desktop the parts 12px apart, as on a phone: one column, the lane plan first. */}
      <div className="@container/dash space-y-3" data-testid="matchup-dashboard" data-layer={plan ? (shows ? "curated" : "assembled") : undefined}>
        {!you && !enemy ? <NothingChosen curated={curated} byId={byId} /> : null}

        {you && !enemy ? (
          <EmptyState icon={Swords} title={`Playing ${you.name}: now ${lowerFirst(slotWords(role, "enemy").choose)}`} action={<OpenPickerButton slot="enemy" testId="matchup-choose-enemy">{slotWords(role, "enemy").choose}</OpenPickerButton>} testId="matchup-need-enemy" compact>
            {curatedForYou.length ? <CuratedLinks you={you} enemies={curatedForYou} label={`Curated briefings for ${you.name}:`} centered /> : <p>The enemy&apos;s abilities, base cooldowns and crowd control follow once you choose them.</p>}
          </EmptyState>
        ) : null}

        {enemy && !you ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-border bg-surface/60 px-3 py-2 text-sm text-fg-muted" data-testid="matchup-need-you">
            <span>Choose your champion for a curated briefing on this lane where one exists, or both champions&apos; facts side by side. Below are {enemy.name}&apos;s abilities.</span>
            <OpenPickerButton slot="you" testId="matchup-choose-you">
              Choose your champion
            </OpenPickerButton>
          </p>
        ) : null}

        {enemyIntel ? (
          <>
            {/* 1. The lane plan: the curated briefing where one shows (with the level changes and the
                matchup's own interactions beside it), else the lane reference. A briefing that exists but
                shows nothing (too old, or every part resting on a change) is hidden, and said so, above it. */}
            {you && enemy && matchup ? (
              <Briefing
                matchup={matchup}
                you={you}
                enemy={enemy}
                rows={rows}
                means={meansOf(enemyIntel)}
                levels={shows ? <LevelNotesPanel intels={[enemyIntel, yourIntel]} variant="section" /> : null}
                interactions={shows ? <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} yourIntel={yourIntel} you={you} rows={rows} variant="section" parts="matchup" /> : null}
              />
            ) : null}
            {you && enemy && !shows ? <AssembledReference you={you} enemy={enemy} enemyIntel={enemyIntel} yourIntel={yourIntel} enemy2Intel={duo ? enemy2Intel : null} allyIntel={duo ? allyIntel : null} curatedForYou={curatedForYou} rows={rows} briefingHidden={!!matchup} /> : null}

            {/* 2. The enemy's abilities as a strip: P to R side by side, each cooldown large, each tile
                opening its Peek; in the bot lane both enemies' strips, one under the other. */}
            <div className="space-y-3" data-testid="matchup-enemy-kits">
              <AbilitiesPanel intel={enemyIntel} title={mirror ? `${enemyIntel.champion.name}'s abilities (both sides)` : `${enemyIntel.champion.name}'s abilities`} testId="matchup-enemy-abilities" notice={stale} haste foldSources />
              {enemy2Intel ? <AbilitiesPanel intel={enemy2Intel} title={`${enemy2Intel.champion.name}'s abilities`} testId="matchup-enemy2-abilities" foldSources /> : null}
            </div>

            {/* 3. The sources and notices, directly under the strips (as under the kits since Release 10): their
                summary always on the first screen, the rest one press away. */}
            <MatchupFooter view={view} legal={legal} />

            {/* 4. The rest of the reference, one press away: the notes the plan does not hold, your side's
                kits, Riot's tips and the evidence from the team's games. */}
            {notes || yours || tipsShown ? (
              <Fold
                testId="matchup-full-reference"
                summaryTestId="matchup-full-reference-summary"
                className="panel-depth"
                bodyClassName="space-y-3 p-3 sm:p-3"
                summary={
                  // One line: its title, and what it holds.
                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold text-fg">{FULL_REFERENCE_TITLE}</span>
                    <span className="text-xs text-fg-muted">{referenceWords}</span>
                  </span>
                }
              >
                {notes}
                {yours}
                {tips}
              </Fold>
            ) : null}
          </>
        ) : null}

        {/* With no enemy chosen, the sources and notices close the page. */}
        {enemyIntel ? null : <MatchupFooter view={view} legal={legal} />}
      </div>
    </AbilityPeekProvider>
  );
}
