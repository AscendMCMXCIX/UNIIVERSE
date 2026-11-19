import { ChevronDown, History, TriangleAlert } from "lucide-react";
import type * as React from "react";
import type { ChampionChoice, ChampionIntelView, InteractionView, MatchupIntelView } from "@/domain/matchup-intel/types";
import { kitOf } from "@/domain/matchup-intel/kit";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { Panel } from "@/components/ui/panel";
import { AbilityRefLink } from "./ability-ref-link";
import { AbilityChips, HiddenNote, abilityNames } from "./briefing";
import { FactChipView } from "./fact-chip";
import { CHECKED_NOTES_LABEL, NO_INTERACTIONS_WORDS, SLOT_NAMES, abilityAnchor, expiredInteractionsWords, expiredNotesWords, hiddenInteractionsWords, moreWords, noLevelNotesWords, notRecheckedWords, revisionWords } from "./wording";

/*
  The notes around the abilities (docs/MATCHUP_INTEL.md, "The dashboard"), each a compact panel that
  always says what is recorded, never an empty box:
  - Interactions: the curated matchup's own (L1) first, word for word, with what they rest on and
    their source (said once on the panel's line when they all cite one page, as two of the three
    curated files do; beyond the first two, folded behind their count, never cut); then each champion's
    own checked interaction and exception facts (L2), folded side by side ("Renekton's interactions
    and exceptions · 7"). Nothing else: no interaction is made
    up from the two kits (the owner's decision, 18 Nov 2026). A matchup interaction that rests on an
    ability Riot changed after the check is hidden and said, as it is when the matchup's check is too
    old to show.
  - Level changes: the levels at which something notable becomes possible, only where a checked
    note states one, each flagged once Riot changes an ability it rests on; the notes' source said
    once on the panel's line when they all share it, else on each note. The first two (by level)
    show; the rest fold behind their count ("3 more"), word for word, one press away, as lane points
    and interactions do, so four or five notes of two champions never take a screen of their own.
  Each panel's line says how fresh what it shows is, as the tiles' line does: not re-checked for a
  later patch, or checked too long ago (Freshness). On a touch screen every chip, fold and source
  reaches 44px, and none's area covers another's box.
*/

const NO_SOURCE = { title: "", url: "" };

/** One champion's checked interaction and exception facts, folded under one line (each is also a chip on its tile); null when it has none. */
function ChampionInteractions({ intel, testId, rows }: { intel: ChampionIntelView; testId: string; rows: ReadonlySet<string> }) {
  const kit = kitOf(intel);
  const items = kit.interactions;
  const count = items.reduce((n, item) => n + item.chips.length, 0);
  if (!count) return null;
  const flagged = items.filter((i) => i.flagged).reduce((n, item) => n + item.chips.length, 0);
  const champion = intel.champion;
  return (
    <details className="group/facts min-w-0 basis-full open:order-last" data-testid={testId}>
      {/* The chevron stays beside the words; in a narrow panel they wrap beside it, never under it. */}
      <summary className="touch-target flex min-h-7 w-fit cursor-pointer list-none items-center gap-x-1.5 rounded-sm text-xs font-medium text-fg hover:text-accent-strong [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle transition-transform group-open/facts:rotate-180 motion-reduce:transition-none" aria-hidden />
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span>
            {champion.name}&apos;s interactions and exceptions <span className="font-normal text-fg-muted">· {count}</span>
          </span>
          {flagged ? (
            <Badge tone="warn">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {flagged === count ? "Changed since the check" : `${flagged} changed since the check`}
            </Badge>
          ) : null}
        </span>
      </summary>
      <ul className="mt-1 space-y-1 pointer-coarse:mt-3 pointer-coarse:space-y-3">
        {items.map((item) => (
          <li key={item.slot} className="flex flex-wrap items-center gap-1 pointer-coarse:gap-x-1.5 pointer-coarse:gap-y-3" data-testid="enemy-interaction">
            {rows.has(champion.id) ? (
              <AbilityRefLink anchor={abilityAnchor(champion.id, item.slot)} size="sm">
                {`${champion.name} ${item.slot === "P" ? "passive" : SLOT_NAMES[item.slot]}`}
              </AbilityRefLink>
            ) : null}
            {item.chips.map((c, i) => (
              <FactChipView key={i} chip={c} champion={champion.name} ability={item.ability} />
            ))}
            {item.flagged ? (
              <Badge tone="warn" title="Riot's data for this ability changed after the curated notes were checked: they may be out of date">
                Changed since the check
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** How many of the matchup's interactions show before the rest fold behind their count. */
export const INTERACTIONS_SHOWN = 2;

/** How many level notes show (the lowest levels first) before the rest fold behind their count. */
export const LEVELS_SHOWN = 2;

/** About the words of one line in a notes panel (a fold's line, "Renekton's interactions and exceptions · 7"), and of an ability chip. */
const LINE = 40;
const CHIP = 12;

/**
 * Which of the two notes panels holds the more words, by a rough count (each shown interaction's
 * words and chips, each fold's line, each level note shown and the fold's line for the rest): where they sit side by side, the
 * fuller one takes the wider share of the row ("interactions" or "levels", at least twice the
 * other; "folds" when the interactions are then only each champion's folded line, so the notes take
 * two thirds), so it is not left a narrow column a screen taller beside a short one; else "even" (the
 * interactions somewhat wider). The page's own words only: nothing is judged by it.
 */
export function notesBalance(matchup: MatchupIntelView | null, enemyIntel: ChampionIntelView, yourIntel: ChampionIntelView | null): "interactions" | "even" | "levels" | "folds" {
  const intels = [enemyIntel, ...(yourIntel && yourIntel.champion.id !== enemyIntel.champion.id ? [yourIntel] : [])];
  const shown = (matchup?.interactions ?? []).filter((i): i is Extract<InteractionView, { kind: "interaction" }> => i.kind === "interaction").slice(0, INTERACTIONS_SHOWN);
  const folds = intels.filter((intel) => kitOf(intel).interactions.length > 0).length;
  const interactions = shown.reduce((n, i) => n + i.text.length + CHIP * i.abilities.length, 0) + LINE * folds;
  const levelNotes = intels.flatMap((intel) => intel.levelNotes);
  // The notes shown (the first LEVELS_SHOWN, by level), and the fold's line for the rest.
  const shownNotes = [...levelNotes].sort((a, b) => a.level - b.level).slice(0, LEVELS_SHOWN);
  const levels = shownNotes.reduce((n, note) => n + note.text.length + CHIP, 0) + (levelNotes.length > LEVELS_SHOWN ? LINE : 0);
  if (shown.length && interactions >= 2 * Math.max(levels, LINE)) return "interactions";
  // The level notes the fuller: "folds" where the interactions are only each champion's folded line
  // (no interaction of the matchup's own, and no note that some are hidden), which needs no more than a third.
  const noted = (matchup?.interactions ?? []).some((i) => i.kind === "hidden") || (!!matchup?.recheck?.expired && matchup.expiredInteractions > 0);
  if (levelNotes.length && levels >= 2 * Math.max(interactions, LINE)) return shown.length || noted ? "levels" : "folds";
  return "even";
}

/**
 * A note's source, one hover, focus or tap away: the word "source", whose tip names the page (the
 * page itself is linked in the sources' list at the foot, never in a tip). A 24px target, and 44px
 * on a touch screen (touch-target: it sits on a panel's line or after a note, never on a card that
 * is itself a link, so it takes no tap from one).
 */
function SourceTip({ text, testId }: { text: string; testId: string }) {
  return (
    <InfoTip text={text} testId={testId} className="touch-target">
      <span className="text-2xs text-fg-subtle underline decoration-dotted underline-offset-2">source</span>
    </InfoTip>
  );
}

/**
 * How fresh what a panel shows is, on its line, as the tiles' line says it: "Not re-checked for
 * 26.23" while the notes' check is one or two patches old, "Checked three patches ago: may be out of
 * date" after that; nothing while it is current. `rechecks`: the patches the notes shown were not
 * re-checked for; `expired`: the most patches since a check of notes shown that are too old (0: none).
 */
function FreshnessBadges({ rechecks, expired, testId }: { rechecks: readonly string[]; expired: number; testId: string }): React.ReactNode {
  const patch = rechecks[0];
  if (!patch && !expired) return null;
  return (
    // A line of its own under the panel's title and words, so those keep sharing theirs.
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid={`${testId}-freshness`}>
      {patch && !expired ? (
        <span className="inline-flex max-w-full" data-testid={`${testId}-not-rechecked`}>
          <Badge tone="neutral">
            <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {notRecheckedWords(patch)}
          </Badge>
        </span>
      ) : null}
      {expired ? (
        <Badge tone="warn">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {expiredNotesWords(expired)}
        </Badge>
      ) : null}
    </p>
  );
}

/** The patches some champions' checked notes were not re-checked for (their check one or two patches old), each once; and the most patches since a check that is older than that (0: none). */
function freshnessOf(intels: ReadonlyArray<ChampionIntelView | null>): { rechecks: string[]; expired: number } {
  const recheck = intels.flatMap((intel) => (intel?.curated?.recheck ? [intel.curated.recheck] : []));
  return { rechecks: [...new Set(recheck.filter((r) => !r.expired).map((r) => r.patch))], expired: Math.max(0, ...recheck.filter((r) => r.expired).map((r) => r.patches)) };
}

/** One of the curated matchup's interactions: its words, the chips of what it rests on, and its source's name one hover or tap away (the page itself is linked in the sources at the foot). */
function MatchupInteraction({ item, names, rows, source }: { item: Extract<InteractionView, { kind: "interaction" }>; names: ReadonlyMap<string, string>; rows: ReadonlySet<string>; source: { title: string; url: string } }) {
  return (
    <li className="px-3 py-1.5 text-xs leading-snug text-fg" data-testid="matchup-interaction">
      <span>{item.text}</span>
      <AbilityChips refs={item.abilities} names={names} rows={rows} label="Rests on" inline />
      {source.title ? (
        <>
          {" "}
          <SourceTip text={`Source: ${source.title}. Curated matchup notes.`} testId="interaction-source" />
        </>
      ) : null}
    </li>
  );
}

/** The interactions of the pair on the page (see the module's comment), or the fixed words that none are recorded. `rows`: the champions whose tiles are on the page. */
export function InteractionsPanel({ matchup, enemyIntel, yourIntel, you, rows }: { matchup: MatchupIntelView | null; enemyIntel: ChampionIntelView; yourIntel: ChampionIntelView | null; you: ChampionChoice | null; rows: ReadonlySet<string> }) {
  const enemy = enemyIntel.champion;
  const names = new Map<string, string>([[enemy.id, enemy.name]]);
  if (you) names.set(you.id, you.name);
  const fromMatchup = matchup?.interactions ?? [];
  const shown = fromMatchup.filter((i): i is Extract<InteractionView, { kind: "interaction" }> => i.kind === "interaction");
  const hidden = fromMatchup.filter((i): i is Extract<InteractionView, { kind: "hidden" }> => i.kind === "hidden");
  const changed = hidden.flatMap((i) => i.changed).filter((r, i, all) => all.indexOf(r) === i);
  // The matchup's check is too old to show: its interactions are hidden with its briefing, and said.
  const expired = matchup?.recheck?.expired && matchup.expiredInteractions > 0 ? { count: matchup.expiredInteractions, patches: matchup.recheck.patches } : null;
  const mirror = !!yourIntel && yourIntel.champion.id === enemy.id;
  const enemyFacts = kitOf(enemyIntel).interactions.length > 0;
  const yourFacts = !!yourIntel && !mirror && kitOf(yourIntel).interactions.length > 0;
  const sourceOf = (id: string) => {
    const s = matchup?.sources.find((x) => x.id === id);
    return s ? { title: s.title, url: s.url } : NO_SOURCE;
  };
  const nothing = !fromMatchup.length && !expired && !enemyFacts && !yourFacts;
  // One source for all of them (Gwen vs Ornn and Riven vs Mordekaiser each cite one page for their
  // interactions): said once on the panel's line, not after each, where it would take a line of its
  // own beside their chips. Interactions from different pages (Ambessa vs Renekton) each say their own.
  const titles = shown.map((item) => sourceOf(item.source).title);
  const oneSource = titles.length > 0 && titles.every((t) => t && t === titles[0]) ? titles[0]! : null;
  const itemSource = (item: Extract<InteractionView, { kind: "interaction" }>) => (oneSource ? NO_SOURCE : sourceOf(item.source));
  // How fresh what the panel shows is: the matchup's own interactions with its check, each champion's with its notes'.
  const facts = freshnessOf([enemyFacts ? enemyIntel : null, yourFacts ? yourIntel : null]);
  const rechecks = [...new Set([...(shown.length && matchup?.recheck && !matchup.recheck.expired ? [matchup.recheck.patch] : []), ...facts.rechecks])];
  return (
    <Panel className="overflow-hidden" data-testid="matchup-interactions">
      <header className="border-b border-border px-3 py-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-sm font-semibold text-fg">Interactions</h2>
          <p className="text-xs text-fg-muted">
            How abilities meet{you && matchup ? " in this lane" : ""}
            {oneSource ? (
              <>
                {" · "}
                <SourceTip text={`Source: ${oneSource}. Curated matchup notes.`} testId="interaction-source" />
              </>
            ) : null}
          </p>
        </div>
        <FreshnessBadges rechecks={rechecks} expired={facts.expired} testId="matchup-interactions" />
      </header>
      <ul className="divide-y divide-border">
        {shown.slice(0, INTERACTIONS_SHOWN).map((item, i) => (
          <MatchupInteraction key={`m-${i}`} item={item} names={names} rows={rows} source={itemSource(item)} />
        ))}
        {shown.length > INTERACTIONS_SHOWN ? (
          // The rest, word for word, one press away: never cut to fit.
          <li className="py-1">
            <details className="group/more" data-testid="matchup-interactions-more">
              <summary className="touch-target mx-3 inline-flex min-h-7 cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-accent hover:text-accent-strong [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/more:rotate-180 motion-reduce:transition-none" aria-hidden />
                {moreWords(shown.length - INTERACTIONS_SHOWN)}
                <span className="sr-only"> interactions</span>
              </summary>
              <ul className="divide-y divide-border">
                {shown.slice(INTERACTIONS_SHOWN).map((item, i) => (
                  <MatchupInteraction key={`r-${i}`} item={item} names={names} rows={rows} source={itemSource(item)} />
                ))}
              </ul>
            </details>
          </li>
        ) : null}
        {hidden.length ? (
          <li className="px-3 py-2">
            <HiddenNote words={hiddenInteractionsWords(hidden.length, abilityNames(changed, names))} changed={changed} names={names} rows={rows} testId="matchup-interactions-hidden" />
          </li>
        ) : null}
        {expired && matchup ? (
          <li className="px-3 py-2">
            <p className="flex items-start gap-1.5 text-sm text-fg-muted" data-testid="matchup-interactions-expired">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
              <span>{expiredInteractionsWords(expired.count, matchup.verified.patch, expired.patches)}</span>
            </p>
          </li>
        ) : null}
        {enemyFacts || yourFacts ? (
          // Each champion's own, folded side by side on one line; one opened takes the row's width under
          // them. On a touch screen, two folds that wrap stand 16px apart, so neither's 44px area covers the other.
          <li className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-1 pointer-coarse:gap-y-4">
            <ChampionInteractions intel={enemyIntel} testId="enemy-interactions" rows={rows} />
            {yourIntel && !mirror ? <ChampionInteractions intel={yourIntel} testId="your-interactions" rows={rows} /> : null}
          </li>
        ) : null}
        {nothing ? (
          <li className="px-3 py-2 text-xs text-fg-subtle" data-testid="matchup-no-interactions">
            {NO_INTERACTIONS_WORDS}
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}

/** One level note: its level beside its words (above them under 16rem), its source where the panel's line does not give it, and its flag once Riot changed an ability it rests on. */
function LevelNote({ note: n, source }: { note: ChampionIntelView["levelNotes"][number] & { champion: ChampionIntelView["champion"] }; source: string | null }) {
  return (
    <li className="grid grid-cols-1 gap-x-2 gap-y-0.5 px-3 py-1.5 @min-[16rem]/levels:grid-cols-[3.25rem_minmax(0,1fr)]" data-testid="matchup-level-note" data-changed={n.changed ? "" : undefined}>
      <span className="text-xs font-semibold tabular-nums leading-snug text-fg">Level {n.level}</span>
      <p className="min-w-0 text-xs leading-snug text-fg">
        <span className="font-medium">{n.champion.name}:</span> {n.text}
        {source ? (
          <>
            {" "}
            <SourceTip text={source} testId="level-note-source" />
          </>
        ) : null}
        {n.changed ? (
          <>
            {" "}
            <Badge tone="warn" title="Riot's data for an ability this note rests on changed after the curated notes were checked: it may be out of date">
              Changed since the check
            </Badge>
          </>
        ) : null}
      </p>
    </li>
  );
}

/** Level notes of the champions on the page, in level order (the enemy's first at the same level), the first LEVELS_SHOWN shown and the rest folded, or the fixed words that none are recorded. */
export function LevelNotesPanel({ intels }: { intels: ReadonlyArray<ChampionIntelView | null> }) {
  const present = intels.filter((intel): intel is ChampionIntelView => !!intel).filter((intel, i, all) => all.findIndex((x) => x.champion.id === intel.champion.id) === i);
  const notes = present.flatMap((intel, order) => intel.levelNotes.map((n, i) => ({ ...n, champion: intel.champion, order, i }))).sort((a, b) => a.level - b.level || a.order - b.order || a.i - b.i);
  // How fresh the notes are, said once on the panel's line: not re-checked for a later patch, or a
  // check more than two patches old.
  const { rechecks, expired } = freshnessOf(present.filter((intel) => intel.levelNotes.length > 0));
  const sourceText = (n: (typeof notes)[number]) => {
    if (!n.source.title) return null;
    const revision = revisionWords(n.source.revisionTime);
    return `Source: ${n.source.title}${revision ? `, ${revision}` : ""}. ${CHECKED_NOTES_LABEL}.`;
  };
  // Every note from one page (one champion's checked notes): its source said once, on the panel's line.
  const texts = notes.map(sourceText);
  const oneSource = texts.length > 0 && texts.every((t) => t !== null && t === texts[0]) ? texts[0]! : null;
  return (
    <Panel className="overflow-hidden" data-testid="matchup-level-notes">
      <header className="border-b border-border px-3 py-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-sm font-semibold text-fg">Level changes</h2>
          <p className="text-xs text-fg-muted">
            When something becomes possible
            {oneSource ? (
              <>
                {" · "}
                <SourceTip text={oneSource} testId="level-note-source" />
              </>
            ) : null}
          </p>
        </div>
        <FreshnessBadges rechecks={rechecks} expired={expired} testId="matchup-level-notes" />
      </header>
      {notes.length ? (
        // The level beside its note, or above it where the list is under 16rem (a phone at a large
        // text size): beside it, the note would be left a column a word wide.
        <ol className="@container/levels divide-y divide-border">
          {notes.slice(0, LEVELS_SHOWN).map((n) => (
            <LevelNote key={`${n.champion.id}-${n.order}-${n.i}`} note={n} source={oneSource ? null : sourceText(n)} />
          ))}
          {notes.length > LEVELS_SHOWN ? (
            // The rest, word for word, one press away: never cut to fit.
            <li className="py-1">
              <details className="group/more" data-testid="matchup-level-notes-more">
                <summary className="touch-target mx-3 inline-flex min-h-7 cursor-pointer list-none items-center gap-1 rounded-sm text-xs font-medium text-accent hover:text-accent-strong [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-open/more:rotate-180 motion-reduce:transition-none" aria-hidden />
                  {moreWords(notes.length - LEVELS_SHOWN)}
                  <span className="sr-only"> level changes</span>
                </summary>
                <ol className="divide-y divide-border">
                  {notes.slice(LEVELS_SHOWN).map((n) => (
                    <LevelNote key={`${n.champion.id}-${n.order}-${n.i}`} note={n} source={oneSource ? null : sourceText(n)} />
                  ))}
                </ol>
              </details>
            </li>
          ) : null}
        </ol>
      ) : (
        <p className="px-3 py-2 text-xs text-fg-subtle" data-testid="matchup-no-level-notes">
          {noLevelNotesWords(present.map((p) => p.champion.name))}
        </p>
      )}
    </Panel>
  );
}
