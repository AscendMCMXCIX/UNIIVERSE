import type { ChampionChoice, ChampionIntelView, MatchupIntelView } from "@/domain/matchup-intel/types";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { FactBadge } from "./ability-list";
import { AbilityRefLink } from "./ability-ref-link";
import { AbilityChips } from "./briefing";
import { SourceLink } from "./source-link";
import { abilityAnchor, abilityName } from "./wording";

/*
  The notes around the abilities (docs/MATCHUP_INTEL.md): how abilities meet (the matchup's
  interactions first, then the enemy's interaction and exception facts), and the levels at which
  something notable becomes possible. Each says what it rests on; neither appears when there is
  nothing checked to say.
*/

const NO_SOURCE = { title: "", url: "" };

/** The matchup's interactions, then the enemy's interaction and exception facts; null when there are none. */
export function InteractionsPanel({ matchup, enemyIntel, you }: { matchup: MatchupIntelView | null; enemyIntel: ChampionIntelView; you: ChampionChoice | null }) {
  const enemy = enemyIntel.champion;
  const names = new Map<string, string>([[enemy.id, enemy.name]]);
  if (you) names.set(you.id, you.name);
  const fromMatchup = matchup?.interactions ?? [];
  const facts = (enemyIntel.abilities ?? []).flatMap((a) => a.facts.filter((f) => f.kind === "interaction" || f.kind === "exception").map((f, i) => ({ key: `${a.slot}-${i}`, slot: a.slot, fact: f })));
  if (!fromMatchup.length && !facts.length) return null;
  const sourceOf = (id: string) => {
    const s = matchup?.sources.find((x) => x.id === id);
    return s ? { title: s.title, url: s.url } : NO_SOURCE;
  };
  return (
    <Panel className="overflow-hidden" data-testid="matchup-interactions">
      <PanelHeader title="Interactions" subtitle={`How abilities meet${you && matchup ? " in this lane" : ""}, and the exceptions worth knowing`} />
      <ul className="divide-y divide-border">
        {fromMatchup.map((item, i) => (
          <li key={`m-${i}`} className="space-y-1.5 px-3 py-3 sm:px-4" data-testid="matchup-interaction">
            <p className="text-sm leading-relaxed text-fg">{item.text}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <AbilityChips refs={item.abilities} names={names} label="Rests on" />
              {sourceOf(item.source).title ? (
                <span className="text-xs text-fg-subtle">
                  Source: <SourceLink source={sourceOf(item.source)} />
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {facts.map(({ key, slot, fact }) => (
          <li key={key} className="space-y-1.5 px-3 py-3 sm:px-4" data-testid="enemy-interaction">
            <p className="flex flex-wrap items-center gap-2">
              <AbilityRefLink anchor={abilityAnchor(enemy.id, slot)}>{abilityName(enemy.name, slot)}</AbilityRefLink>
              <FactBadge kind={fact.kind} label={fact.label} />
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
  return (
    <Panel className="overflow-hidden" data-testid="matchup-level-notes">
      <PanelHeader title="By level" subtitle="When something notable becomes possible" />
      <ol className="divide-y divide-border">
        {notes.map((n) => (
          <li key={`${n.champion.id}-${n.order}-${n.i}`} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-3 px-3 py-2.5 sm:px-4" data-testid="matchup-level-note">
            <span className="pt-px text-sm font-semibold tabular-nums text-fg">Level {n.level}</span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm leading-relaxed text-fg">
                <span className="font-medium">{n.champion.name}:</span> {n.text}
              </p>
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
