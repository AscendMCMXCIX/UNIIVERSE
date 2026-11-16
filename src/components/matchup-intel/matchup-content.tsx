import { History, Swords } from "lucide-react";
import type { ChampionChoice, ChampionIntelView, MatchupPageView } from "@/domain/matchup-intel/types";
import { comparePatches, patchFromVersion, publicPatchName } from "@/domain/patch";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { AbilitiesPanel, AbilityList, CuratedLine, dataSourceOf } from "./ability-list";
import { Briefing, CuratedLinks, NoBriefing, PAIR_CHIP } from "./briefing";
import { MatchupFooter } from "./matchup-footer";
import { OpenPickerButton, PairLink } from "./matchup-frame";
import { InteractionsPanel, LevelNotesPanel } from "./matchup-notes";
import { staleDataWords } from "./wording";

/*
  MATCHUP INTEL's page body, under the pickers (docs/MATCHUP_INTEL.md), in the order a player needs
  it before lane, one column on a phone:
    (a) the ten-second briefing, where a curated one exists for this pair, or (b) a calm line that
        none exists yet and what follows is the enemy's general reference;
    (c) the enemy's abilities, P Q W E R, with base cooldowns per rank and the checked facts;
    (d) interactions and (e) level notes, one under the other at every width (side by side, the
        short level notes left a column of empty space beside the interactions on a desktop);
    (f) your own champion's abilities, collapsed;
    (g) the sources, the patch and Riot's notice.
  With nothing chosen, or one side only, it says what to do next. Ability data older than the
  game's current patch is said once, above the abilities, naming whose it is when only some is.
*/

const toChoices = (ids: readonly string[] | undefined, byId: ReadonlyMap<string, ChampionChoice>) => (ids ?? []).map((id) => byId.get(id)).filter((c): c is ChampionChoice => !!c);

/** "26.22" for Data Dragon "16.22.1"; null without a version. */
function publicPatchOf(version: string | null): string | null {
  const patch = version ? patchFromVersion(version) : null;
  return patch ? publicPatchName(patch) : null;
}

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
    <p className="flex items-start gap-2 rounded-panel border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-fg" data-testid="matchup-stale">
      <History className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
      <span>{words}</span>
    </p>
  );
}

export function MatchupContent({ view, champions, curated, legal }: { view: MatchupPageView; champions: readonly ChampionChoice[]; curated: Record<string, string[]>; legal: string }) {
  const byId = new Map(champions.map((c) => [c.id, c]));
  const { you, enemy, enemyIntel, yourIntel, matchup } = view;
  const curatedForYou = you ? toChoices(curated[you.id], byId) : [];
  const mirror = !!you && !!enemy && you.id === enemy.id;
  // Each champion's data judged by its own version: one whose file could not be read keeps an older
  // record while the other's is current, and is named.
  const current = view.patch.current;
  const shownData = [enemyIntel, mirror ? null : yourIntel].filter((i): i is ChampionIntelView => !!i?.abilities);
  const behind = current
    ? shownData.flatMap((i) => {
        const patch = publicPatchOf(i.dataVersion);
        return patch && comparePatches(patch, current) < 0 ? [{ name: i.champion.name, patch }] : [];
      })
    : [];
  // The champions whose ability rows are on the page, for the briefing's chips.
  const rows = new Set(shownData.map((i) => i.champion.id));
  const interactions = enemyIntel ? <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} you={you} rows={rows} /> : null;
  const levels = <LevelNotesPanel intels={[enemyIntel, yourIntel]} />;
  const hasInteractions = !!enemyIntel && (!!matchup?.interactions.length || !!matchup?.expiredInteractions || !!enemyIntel.abilities?.some((a) => a.facts.some((f) => f.kind === "interaction" || f.kind === "exception")));
  const hasLevels = [enemyIntel, yourIntel].some((i) => !!i?.levelNotes.length);
  const yourSource = yourIntel ? dataSourceOf(yourIntel) : null;

  return (
    <div className="space-y-5">
      {behind.length && current ? <StaleNote words={staleDataWords(behind, current, behind.length === shownData.length)} /> : null}

      {!you && !enemy ? <NothingChosen curated={curated} byId={byId} /> : null}

      {you && !enemy ? (
        <EmptyState icon={Swords} title={`Playing ${you.name}: now choose the enemy`} action={<OpenPickerButton slot="enemy" testId="matchup-choose-enemy">Choose the enemy</OpenPickerButton>} testId="matchup-need-enemy" compact>
          {curatedForYou.length ? <CuratedLinks you={you} enemies={curatedForYou} label={`Curated briefings for ${you.name}:`} centered /> : <p>The enemy&apos;s abilities and base cooldowns follow once you choose them.</p>}
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

      {you && enemy ? matchup ? <Briefing matchup={matchup} you={you} enemy={enemy} rows={rows} /> : <NoBriefing you={you} enemy={enemy} curatedForYou={curatedForYou} /> : null}

      {enemyIntel ? <AbilitiesPanel intel={enemyIntel} title={mirror ? `${enemyIntel.champion.name}'s abilities (both sides)` : `${enemyIntel.champion.name}'s abilities`} testId="matchup-enemy-abilities" /> : null}

      {hasInteractions ? interactions : null}
      {hasLevels ? levels : null}

      {yourIntel && !mirror ? (
        // A section with a heading of its own, so its abilities' headings sit under it rather than
        // under the panel before it: the disclosure's title is not one (a heading inside its
        // summary is not read as one everywhere), so the heading is for screen readers alone.
        <section>
          <h2 className="sr-only">{`Your champion: ${yourIntel.champion.name}`}</h2>
          <Disclosure
            title={`Your champion: ${yourIntel.champion.name}`}
            description={
              // Where its abilities come from, its own version (which may differ from the enemy's), and its notes' check.
              <span className="flex flex-col gap-1">
                <span>Abilities and base cooldowns, for reference{yourSource ? ` · ${yourSource}` : ""}</span>
                <CuratedLine intel={yourIntel} />
              </span>
            }
            testId="matchup-your-abilities"
          >
            <div className="-m-3 sm:-m-4">
              <AbilityList intel={yourIntel} testId="matchup-your-abilities-list" />
            </div>
          </Disclosure>
        </section>
      ) : null}

      <MatchupFooter view={view} legal={legal} />
    </div>
  );
}
