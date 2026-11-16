import { ChevronDown, History, TriangleAlert } from "lucide-react";
import type { ChampionChoice, ChampionIntelView, InteractionView, MatchupIntelView } from "@/domain/matchup-intel/types";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { FactBadge } from "./ability-list";
import { AbilityRefLink } from "./ability-ref-link";
import { AbilityChips, HiddenNote, abilityNames } from "./briefing";
import { SourceLink } from "./source-link";
import { abilityAnchor, abilityName, expiredInteractionsWords, expiredNotesWords, hiddenInteractionsWords, subjectWords } from "./wording";

/*
  The notes around the abilities (docs/MATCHUP_INTEL.md): how abilities meet (the matchup's
  interactions first, then the enemy's interaction and exception facts, folded under one line: each
  is also on its ability's row, as a badge with its sentence and source in the row's details), and
  the levels at which something notable becomes possible. Each says what it rests on; neither
  appears when there is nothing checked to say. A matchup interaction that rests on an ability Riot
  changed after the check is hidden, and the panel says so, as it says when the matchup's check is
  too old to show; an enemy fact or a level note from a changed ability is flagged, as its row is.
*/

const NO_SOURCE = { title: "", url: "" };

/** The matchup's interactions, then the enemy's interaction and exception facts; null when there are none. `rows`: the champions whose ability rows are on the page, for the chips. */
export function InteractionsPanel({ matchup, enemyIntel, you, rows }: { matchup: MatchupIntelView | null; enemyIntel: ChampionIntelView; you: ChampionChoice | null; rows?: ReadonlySet<string> }) {
  const enemy = enemyIntel.champion;
  const names = new Map<string, string>([[enemy.id, enemy.name]]);
  if (you) names.set(you.id, you.name);
  const fromMatchup = matchup?.interactions ?? [];
  const shown = fromMatchup.filter((i): i is Extract<InteractionView, { kind: "interaction" }> => i.kind === "interaction");
  const hidden = fromMatchup.filter((i): i is Extract<InteractionView, { kind: "hidden" }> => i.kind === "hidden");
  const changed = hidden.flatMap((i) => i.changed).filter((r, i, all) => all.indexOf(r) === i);
  const facts = (enemyIntel.abilities ?? []).flatMap((a) => a.facts.filter((f) => f.kind === "interaction" || f.kind === "exception").map((f, i) => ({ key: `${a.slot}-${i}`, slot: a.slot, fact: f, flagged: a.freshness === "changed-since" })));
  const flagged = facts.filter((f) => f.flagged).length;
  // The matchup's check is too old to show: its interactions are hidden with its briefing, and said.
  const expired = matchup?.recheck?.expired && matchup.expiredInteractions > 0 ? { count: matchup.expiredInteractions, patches: matchup.recheck.patches } : null;
  if (!fromMatchup.length && !facts.length && !expired) return null;
  const sourceOf = (id: string) => {
    const s = matchup?.sources.find((x) => x.id === id);
    return s ? { title: s.title, url: s.url } : NO_SOURCE;
  };
  return (
    <Panel className="overflow-hidden" data-testid="matchup-interactions">
      <PanelHeader title="Interactions" subtitle={`How abilities meet${you && matchup ? " in this lane" : ""}, and the exceptions worth knowing`} />
      <ul className="divide-y divide-border">
        {shown.map((item, i) => (
          <li key={`m-${i}`} className="space-y-1.5 px-3 py-3 sm:px-4" data-testid="matchup-interaction">
            <p className="text-sm leading-relaxed text-fg">{item.text}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <AbilityChips refs={item.abilities} names={names} rows={rows} label="Rests on" />
              {sourceOf(item.source).title ? (
                <span className="text-xs text-fg-subtle">
                  Source: <SourceLink source={sourceOf(item.source)} />
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {hidden.length ? (
          <li className="px-3 py-3 sm:px-4">
            <HiddenNote words={hiddenInteractionsWords(hidden.length, abilityNames(changed, names))} changed={changed} names={names} rows={rows} testId="matchup-interactions-hidden" />
          </li>
        ) : null}
        {expired && matchup ? (
          <li className="px-3 py-3 sm:px-4">
            <p className="flex items-start gap-1.5 text-sm text-fg-muted" data-testid="matchup-interactions-expired">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
              <span>{expiredInteractionsWords(expired.count, matchup.verified.patch, expired.patches)}</span>
            </p>
          </li>
        ) : null}
        {facts.length ? (
          <li>
            {/* Folded until asked for: each is on its ability's row already, as a badge with its
                sentence and source in the row's details. A fold opened stays a list of the same
                sentences, one tap away, and a flag on the line says when any is from a changed ability. */}
            <details className="group/facts" data-testid="enemy-interactions">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 hover:bg-surface-2/50 sm:px-4 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium text-fg">
                    {enemy.name}&apos;s interactions and exceptions <span className="font-normal text-fg-muted">· {facts.length}</span>
                  </span>
                  {flagged ? (
                    <Badge tone="warn">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {flagged === facts.length ? "Changed since the check" : `${flagged} changed since the check`}
                    </Badge>
                  ) : null}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open/facts:rotate-180 motion-reduce:transition-none" aria-hidden />
              </summary>
              <ul className="divide-y divide-border border-t border-border">
                {facts.map(({ key, slot, fact, flagged: isFlagged }) => (
                  <li key={key} className="space-y-1.5 px-3 py-3 sm:px-4" data-testid="enemy-interaction">
                    <p className="flex flex-wrap items-center gap-2">
                      <AbilityRefLink anchor={abilityAnchor(enemy.id, slot)}>{abilityName(enemy.name, slot)}</AbilityRefLink>
                      <FactBadge kind={fact.kind} label={fact.label} subject={subjectWords(fact.kind, fact.appliesTo, enemy.name)} />
                      {isFlagged ? (
                        <Badge tone="warn" title="Riot's data for this ability changed after the curated notes were checked: they may be out of date">
                          Changed since the check
                        </Badge>
                      ) : null}
                    </p>
                    {fact.detail ? <p className="text-sm leading-relaxed text-fg-muted">{fact.detail}</p> : null}
                    {fact.source.title ? (
                      <p className="text-xs text-fg-subtle">
                        Source: <SourceLink source={fact.source} />
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}

/** Level notes of the champions on the page, in level order (the enemy's first at the same level); null when there are none. */
export function LevelNotesPanel({ intels }: { intels: ReadonlyArray<ChampionIntelView | null> }) {
  const notes = intels
    .filter((intel): intel is ChampionIntelView => !!intel)
    .filter((intel, i, all) => all.findIndex((x) => x.champion.id === intel.champion.id) === i)
    .flatMap((intel, order) => intel.levelNotes.map((n, i) => ({ ...n, champion: intel.champion, order, i })))
    .sort((a, b) => a.level - b.level || a.order - b.order || a.i - b.i);
  if (!notes.length) return null;
  // Notes from a champion whose check is more than two patches old: said once, on the panel's line.
  const expired = Math.max(0, ...intels.flatMap((intel) => (intel?.levelNotes.length && intel.curated?.recheck?.expired ? [intel.curated.recheck.patches] : [])));
  return (
    <Panel className="overflow-hidden" data-testid="matchup-level-notes">
      <PanelHeader
        title="By level"
        subtitle={
          expired ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>When something notable becomes possible</span>
              <Badge tone="warn">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {expiredNotesWords(expired)}
              </Badge>
            </span>
          ) : (
            "When something notable becomes possible"
          )
        }
      />
      {/* The level beside its note, or above it where the list is under 16rem (a phone at a large text
          size, as the ability rows): beside it, the note would be left a column a word wide. */}
      <ol className="@container/levels divide-y divide-border">
        {notes.map((n) => (
          <li key={`${n.champion.id}-${n.order}-${n.i}`} className="grid grid-cols-1 gap-x-3 gap-y-0.5 px-3 py-2.5 @min-[16rem]/levels:grid-cols-[4.75rem_minmax(0,1fr)] sm:px-4" data-testid="matchup-level-note" data-changed={n.changed ? "" : undefined}>
            <span className="pt-px text-sm font-semibold tabular-nums text-fg">Level {n.level}</span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm leading-relaxed text-fg">
                <span className="font-medium">{n.champion.name}:</span> {n.text}
              </p>
              {n.changed ? (
                <p>
                  <Badge tone="warn" title="Riot's data for an ability this note rests on changed after the curated notes were checked: it may be out of date">
                    Changed since the check
                  </Badge>
                </p>
              ) : null}
              {n.source.title ? (
                <p className="text-xs text-fg-subtle">
                  Source: <SourceLink source={n.source} />
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
