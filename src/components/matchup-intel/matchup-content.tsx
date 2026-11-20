import { History, Swords } from "lucide-react";
import { DUO_ROLES, type ChampionChoice, type ChampionIntelView, type MatchupPageView } from "@/domain/matchup-intel/types";
import { EmptyState } from "@/components/ui/empty-state";
import { AbilitiesPanel, YourChampion } from "./ability-list";
import { AssembledReference } from "./assembled";
import { Briefing, CuratedLinks, PAIR_CHIP, briefingShows } from "./briefing";
import { MatchupFooter } from "./matchup-footer";
import { OpenPickerButton, PairLink } from "./matchup-frame";
import { slotWords } from "./slots";
import { RiotTipsPanel } from "./riot-tips";
import { EvidenceBody, EvidenceSummary } from "./evidence-panel";
import { MatchupGlance } from "./glance";
import type { MatchupEvidence } from "@/domain/matchup-intel/evidence";
import { InteractionsPanel, LevelNotesPanel, notesBalance } from "./matchup-notes";
import { behindOf } from "./matchup-status";
import { staleDataWords } from "./wording";
import type { MeansAbility } from "@/domain/matchup-intel/haste";
import type { AbilityRef } from "@/domain/matchup-intel/types";

/** The enemy's abilities by their ref ("Darius.E"), for the briefing rows' "what it means" lines; none without stored abilities. */
function meansOf(intel: ChampionIntelView | null): Partial<Record<AbilityRef, MeansAbility>> | undefined {
  if (!intel?.abilities) return undefined;
  return Object.fromEntries(intel.abilities.map((a) => [`${intel.champion.id}.${a.slot}`, { champion: intel.champion.name, slot: a.slot, basis: a.haste }]));
}

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
  On a phone, first a glance (glance.tsx: the enemies' tiles with their cooldown lines and the
  evidence's first row), then the same order in one column: the main panel, the interactions, the level changes,
  the enemy's tiles, your champion, the sources. With nothing chosen, or one side only, it says
  what to do next.
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

/** The dashboard's two columns: one on a phone (see the module's comment). */
/**
 * The dashboard's columns: one on a phone; two from a body 60rem wide (see the module's comment). In
 * the bot lane the kit column is as wide as the main one: it holds the two enemies' kits side by side.
 */
const COLUMNS = {
  solo: "grid gap-3 @min-[60rem]/dash:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] @min-[60rem]/dash:items-start",
  duo: "grid gap-3 @min-[60rem]/dash:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] @min-[60rem]/dash:items-start",
} as const;
/** The interactions and the level notes side by side where the column has room, the fuller panel the wider (notesBalance). */
const NOTES_SPLIT = {
  interactions: "@min-[40rem]/dash:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]",
  even: "@min-[40rem]/dash:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]",
  levels: "@min-[40rem]/dash:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]",
  // The interactions only each champion's folded line: a third is room enough for it.
  folds: "@min-[40rem]/dash:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
} as const;

export function MatchupContent({ view, champions, curated, legal, evidence = null }: { view: MatchupPageView; champions: readonly ChampionChoice[]; curated: Record<string, string[]>; legal: string; evidence?: MatchupEvidence | null }) {
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
  // Riot's tips and the evidence from the team's games share one fold, its line stating both.
  const tips = <RiotTipsPanel enemies={[enemyIntel, enemy2Intel].filter((i): i is ChampionIntelView => !!i)} yours={[mirror ? null : yourIntel, allyIntel].filter((i): i is ChampionIntelView => !!i)} evidenceSummary={<EvidenceSummary evidence={evidence} />} evidence={<EvidenceBody evidence={evidence} duo={duo} pair={{ chosen: !!you && !!enemy, curated: shows, hidden: !shows && !!matchup }} />} />;

  return (
    // On a desktop (two columns) the panels 8px apart, 12px on a phone: the one screen keeps room for
    // the notices a later patch adds ("Not re-checked for 26.23"), which production shows from each new
    // patch until the curated notes are re-checked (e2e/matchup-intel-dashboard.spec.ts reads that state).
    <div className="@container/dash space-y-3 @min-[60rem]/dash:space-y-2" data-testid="matchup-dashboard" data-layer={you && enemy ? (shows ? "curated" : "assembled") : undefined}>
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

      {/* A phone's first screen: every enemy tile with its cooldown line, and the evidence's first row (glance.tsx). */}
      {enemyIntel ? <MatchupGlance enemies={[enemyIntel, enemy2Intel].filter((i): i is ChampionIntelView => !!i)} evidence={evidence} /> : null}

      {enemyIntel ? (
        <div className={duo ? COLUMNS.duo : COLUMNS.solo}>
          <div className="min-w-0 space-y-3 @min-[60rem]/dash:space-y-2">
            {you && enemy && matchup ? <Briefing matchup={matchup} you={you} enemy={enemy} rows={rows} means={meansOf(enemyIntel)} /> : null}
            {/* A briefing that exists but shows nothing (too old, or every part resting on a change) is hidden above, and said so there. */}
            {you && enemy && !shows ? <AssembledReference you={you} enemy={enemy} enemyIntel={enemyIntel} yourIntel={yourIntel} curatedForYou={curatedForYou} rows={rows} briefingHidden={!!matchup} /> : null}
            {/* Side by side where the column has room, the fuller of the two the wider. */}
            <div className={`grid gap-3 @min-[40rem]/dash:items-start ${NOTES_SPLIT[balance]}`} data-testid="matchup-notes" data-balance={balance}>
              <InteractionsPanel matchup={matchup} enemyIntel={enemyIntel} yourIntel={yourIntel} you={you} rows={rows} />
              <LevelNotesPanel intels={[enemyIntel, yourIntel]} />
            </div>
          </div>
          {/* A flex column, so the sources' line can sit under the enemy's kits on a desktop and at the
              page's foot in one column (order), as before. */}
          <div className="flex min-w-0 flex-col gap-3 @min-[60rem]/dash:gap-2">
            {/* In the bot lane with both enemies chosen, their two kits side by side where the column has room. */}
            <div className={enemy2Intel ? "grid gap-3 @min-[60rem]/dash:grid-cols-2" : undefined} data-testid="matchup-enemy-kits">
              <AbilitiesPanel intel={enemyIntel} title={mirror ? `${enemyIntel.champion.name}'s abilities (both sides)` : `${enemyIntel.champion.name}'s abilities`} testId="matchup-enemy-abilities" notice={stale} haste />
              {enemy2Intel ? <AbilitiesPanel intel={enemy2Intel} title={`${enemy2Intel.champion.name}'s abilities`} testId="matchup-enemy2-abilities" /> : null}
            </div>
            {/* The sources and notices: on a desktop (two columns) directly under the enemy's kits, so the
                first screen keeps them in every state of the briefing, whatever the left column holds
                (Release 10: with an enemy ability changed, the briefing's notes put them under the fold at
                1440 × 900); in one column, last, at the page's foot. */}
            <div className="order-last @min-[60rem]/dash:order-none">
              <MatchupFooter view={view} legal={legal} />
            </div>
            {/* Your duo's two kits side by side under the enemies' where the column has room. */}
            {(yourIntel && !mirror) || allyIntel ? (
              <div className={duo && allyIntel && yourIntel && !mirror ? "grid gap-3 @min-[60rem]/dash:grid-cols-2 @min-[60rem]/dash:items-start" : undefined}>
                {yourIntel && !mirror ? <YourChampion intel={yourIntel} label={duo ? slotWords(role, "you").label : undefined} /> : null}
                {allyIntel ? <YourChampion intel={allyIntel} label={slotWords(role, "ally").label} testId="matchup-ally-abilities" /> : null}
              </div>
            ) : null}
            {/* Riot's tips and the evidence from the team's games: one folded line under the kits, so the one-screen fit holds. */}
            {tips}
          </div>
        </div>
      ) : null}

      {enemyIntel ? null : <MatchupFooter view={view} legal={legal} />}
    </div>
  );
}
