import { History, Swords } from "lucide-react";
import type { ChampionChoice, MatchupPageView } from "@/domain/matchup-intel/types";
import { EmptyState } from "@/components/ui/empty-state";
import { AbilitiesPanel, YourChampion } from "./ability-list";
import { AssembledReference } from "./assembled";
import { Briefing, CuratedLinks, PAIR_CHIP, briefingShows } from "./briefing";
import { MatchupFooter } from "./matchup-footer";
import { OpenPickerButton, PairLink } from "./matchup-frame";
import { InteractionsPanel, LevelNotesPanel } from "./matchup-notes";
import { behindOf } from "./matchup-status";
import { staleDataWords } from "./wording";

/*
  MATCHUP INTEL's page body, under the picker bar (docs/MATCHUP_INTEL.md, "The dashboard"): on a
  desktop one screen, read in a glance, with no page scroll at 1920 by 1080, 2560 by 1440 and a
  maximised 1920 by 950 window; on a phone one column, the essentials first.

  On a desktop, two columns (from a body 60rem wide), each as tall as its own content:
    left    the main panel: the curated briefing (threat, opportunity, lane points) where one exists
            for this pair, else the assembled reference (the enemy's kit as the danger side, yours as
            the opportunity side, grouped by kind); under it the interactions and the level changes,
            side by side;
    right   the enemy's abilities, P Q W E R, one compact tile each, always in that order; under
            them your own champion, folded into one line.
  The patch and how fresh the page is sit in the bar above (MatchupStatus); the sources and Riot's
  notice at the foot, behind one control whose summary line stays visible.
  On a phone, the same order in one column: the main panel, the interactions, the level changes,
  the enemy's tiles, your champion, the sources. With nothing chosen, or one side only, it says
  what to do next.
*/

const toChoices = (ids: readonly string[] | undefined, byId: ReadonlyMap<string, ChampionChoice>) => (ids ?? []).map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);

/** Nothing chosen: what the page does, and the curated briefings there are so far. */
function NothingChosen({ curated, byId }: { curated: Record<string, string[]>; byId: ReadonlyMap<string, ChampionChoice> }) {
  const pairs = Object.entries(curated).flatMap(([you, enemies]) => {
    const a = byId.get(you);
    return a ? toChoices(enemies, byId).map((b) => ({ you: a, enemy: b })) : [];
  });
  return (
    <EmptyState icon={Swords} title="Choose your champion and the enemy" action={<OpenPickerButton slot="you" testId="matchup-start">Choose your champion</OpenPickerButton>} testId="matchup-empty">
      <p>Then read the enemy&apos;s abilities with their base cooldowns and crowd control, and what matters in lane: a curated briefing where one exists, otherwise each champion&apos;s own facts side by side.</p>
      {pairs.length ? (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5" data-testid="matchup-curated-pairs">
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

/** The dashboard's two columns: one on a phone (see the module's comment). */
const COLUMNS = "grid gap-3 @min-[60rem]/dash:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] @min-[60rem]/dash:items-start";

export function MatchupContent({ view, champions, curated, legal }: { view: MatchupPageView; champions: readonly ChampionChoice[]; curated: Record<string, string[]>; legal: string }) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const { you, enemy, enemyIntel, yourIntel, matchup } = view;
  const curatedForYou = you ? toChoices(curated[you.id], byId) : [];
  const mirror = !!you && !!enemy && you.id === enemy.id;
  const current = view.patch.current;
  const shownData = [enemyIntel, mirror ? null : yourIntel].filter((i) => !!i?.abilities);
  const behind = behindOf(view);
  // The champions whose ability tiles are on the page (yours folded, but there), for the chips.
  const rows = new Set(shownData.map((i) => i!.champion.id));
  const stale = behind.length && current ? <StaleNote words={staleDataWords(behind, current, behind.length === shownData.length)} /> : null;
  const shows = briefingShows(matchup);

  return (
    <div className="@container/dash space-y-3" data-testid="matchup-dashboard" data-layer={you && enemy ? (shows ? "curated" : "assembled") : undefined}>
      {!you && !enemy ? <NothingChosen curated={curated} byId={byId} /> : null}

      {you && !enemy ? (
        <EmptyState icon={Swords} title={`Playing ${you.name}: now choose the enemy`} action={<OpenPickerButton slot="enemy" testId="matchup-choose-enemy">Choose the enemy</OpenPickerButton>} testId="matchup-need-enemy" compact>
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
        <div className={COLUMNS}>
          <div className="min-w-0 space-y-3">
            {you && enemy && matchup ? <Briefing matchup={matchup} you={you} enemy={enemy} rows={rows} /> : null}
            {you && enemy && !shows ? <AssembledReference you={you} enemy={enemy} enemyIntel={enemyIntel} yourIntel={yourIntel} curatedForYou={curatedForYou} rows={rows} /> : null}
            {/* Side by side where the column has room, the interactions the wider. */}
            <div className="grid gap-3 @min-[40rem]/dash:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] @min-[40rem]/dash:items-start">
              <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} yourIntel={yourIntel} you={you} rows={rows} />
              <LevelNotesPanel intels={[enemyIntel, yourIntel]} />
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <AbilitiesPanel intel={enemyIntel} title={mirror ? `${enemyIntel.champion.name}'s abilities (both sides)` : `${enemyIntel.champion.name}'s abilities`} testId="matchup-enemy-abilities" notice={stale} />
            {yourIntel && !mirror ? <YourChampion intel={yourIntel} /> : null}
          </div>
        </div>
      ) : null}

      <MatchupFooter view={view} legal={legal} />
    </div>
  );
}
