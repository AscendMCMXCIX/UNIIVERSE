import Link from "next/link";
import { History, Swords } from "lucide-react";
import type { ChampionChoice, MatchupPageView } from "@/domain/matchup-intel/types";
import { comparePatches } from "@/domain/patch";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { matchupHref } from "./address";
import { AbilitiesPanel, AbilityList } from "./ability-list";
import { Briefing, CuratedLinks, NoBriefing } from "./briefing";
import { MatchupFooter } from "./matchup-footer";
import { OpenPickerButton } from "./matchup-frame";
import { InteractionsPanel, LevelNotesPanel } from "./matchup-notes";

/*
  MATCHUP INTEL's page body, under the pickers (docs/MATCHUP_INTEL.md), in the order a player needs
  it before lane, one column on a phone:
    (a) the ten-second briefing, where a curated one exists for this pair, or (b) a calm line that
        none exists yet and what follows is the enemy's general reference;
    (c) the enemy's abilities, P Q W E R, with base cooldowns per rank and the checked facts;
    (d) interactions and (e) level notes, side by side where there is room;
    (f) your own champion's abilities, collapsed;
    (g) the sources, the patch and Riot's notice.
  With nothing chosen, or one side only, it says what to do next.
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
      <p>Then read the enemy&apos;s abilities with their base cooldowns and, where a curated briefing exists, what matters in lane.</p>
      {pairs.length ? (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-1.5" data-testid="matchup-curated-pairs">
          <span>Curated briefings so far:</span>
          {pairs.map(({ you, enemy }) => (
            <Link key={`${you.id}-${enemy.id}`} href={matchupHref(you.id, enemy.id)} prefetch={false} className="touch-target inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/60 hover:text-fg" data-testid="matchup-curated-pair">
              {you.name} vs {enemy.name}
            </Link>
          ))}
        </p>
      ) : null}
    </EmptyState>
  );
}

/** Ability data older than the game's current patch: said once, above the abilities. */
function StaleNote({ data, current }: { data: string; current: string }) {
  return (
    <p className="flex items-start gap-2 rounded-panel border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-fg" data-testid="matchup-stale">
      <History className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
      <span>
        The ability data held here is from patch {data}; the game is on patch {current}. It updates with the next game-data update.
      </span>
    </p>
  );
}

export function MatchupContent({ view, champions, curated, legal }: { view: MatchupPageView; champions: readonly ChampionChoice[]; curated: Record<string, string[]>; legal: string }) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const { you, enemy, enemyIntel, yourIntel, matchup } = view;
  const curatedForYou = you ? toChoices(curated[you.id], byId) : [];
  const stale = view.patch.data && view.patch.current && comparePatches(view.patch.data, view.patch.current) < 0 ? { data: view.patch.data, current: view.patch.current } : null;
  const mirror = !!you && !!enemy && you.id === enemy.id;
  const interactions = enemyIntel ? <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} you={you} /> : null;
  const levels = <LevelNotesPanel intels={[enemyIntel, yourIntel]} />;
  const hasInteractions = !!enemyIntel && (!!matchup?.interactions.length || !!enemyIntel.abilities?.some((a) => a.facts.some((f) => f.kind === "interaction" || f.kind === "exception")));
  const hasLevels = [enemyIntel, yourIntel].some((i) => !!i?.levelNotes.length);

  return (
    <div className="space-y-5">
      {stale && (enemyIntel?.abilities || yourIntel?.abilities) ? <StaleNote data={stale.data} current={stale.current} /> : null}

      {!you && !enemy ? <NothingChosen curated={curated} byId={byId} /> : null}

      {you && !enemy ? (
        <EmptyState icon={Swords} title={`Playing ${you.name}: now choose the enemy`} action={<OpenPickerButton slot="enemy" testId="matchup-choose-enemy">Choose the enemy</OpenPickerButton>} testId="matchup-need-enemy" compact>
          {curatedForYou.length ? <CuratedLinks you={you} enemies={curatedForYou} label={`Curated briefings for ${you.name}:`} /> : <p>The enemy&apos;s abilities and base cooldowns follow once you choose them.</p>}
        </EmptyState>
      ) : null}

      {enemy && !you ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-panel border border-border bg-surface/60 px-4 py-3 text-sm text-fg-muted" data-testid="matchup-need-you">
          <span>Choose your champion for a curated briefing on this lane, where one exists. Below is the general reference for {enemy.name}.</span>
          <OpenPickerButton slot="you" testId="matchup-choose-you">
            Choose your champion
          </OpenPickerButton>
        </p>
      ) : null}

      {you && enemy ? matchup ? <Briefing matchup={matchup} you={you} enemy={enemy} /> : <NoBriefing you={you} enemy={enemy} curatedForYou={curatedForYou} /> : null}

      {enemyIntel ? <AbilitiesPanel intel={enemyIntel} title={mirror ? `${enemyIntel.champion.name}'s abilities (both sides)` : `${enemyIntel.champion.name}'s abilities`} testId="matchup-enemy-abilities" /> : null}

      {hasInteractions || hasLevels ? (
        <div className={cn("grid items-start gap-4", hasInteractions && hasLevels && "lg:grid-cols-2")}>
          {hasInteractions ? interactions : null}
          {hasLevels ? levels : null}
        </div>
      ) : null}

      {yourIntel && !mirror ? (
        <Disclosure title={`Your champion: ${yourIntel.champion.name}`} description="Abilities, base cooldowns and checked notes, for reference" testId="matchup-your-abilities">
          <div className="-m-3 sm:-m-4">
            <AbilityList intel={yourIntel} testId="matchup-your-abilities-list" />
          </div>
        </Disclosure>
      ) : null}

      <MatchupFooter view={view} legal={legal} />
    </div>
  );
}
