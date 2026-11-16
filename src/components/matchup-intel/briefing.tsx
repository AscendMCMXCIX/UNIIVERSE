import Link from "next/link";
import { Crosshair, TriangleAlert, Waypoints } from "lucide-react";
import type { AbilityRef, ChampionChoice, MatchupIntelView, Slot } from "@/domain/matchup-intel/types";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { matchupHref } from "./address";
import { AbilityRefLink } from "./ability-ref-link";
import { abilityAnchor, abilityName, freshnessWords } from "./wording";

/*
  The matchup's curated layer (docs/MATCHUP_INTEL.md): the ten-second briefing, for your champion
  against this enemy only. A threat, an opportunity and a few points about the lane, each with the
  abilities it rests on as chips that jump to their rows; when it was checked, and a warning when
  Riot's numbers for those abilities moved after the check. A briefing points at what matters and
  leaves the decisions to the player. Where none exists, a calm line says so, and what follows is
  the enemy's general reference.
*/

const REF = /^([A-Za-z0-9]{1,40})\.(P|Q|W|E|R)$/;

/** The chips under a point: one per ability it rests on, named "<Champion> <key>". */
export function AbilityChips({ refs, names, label }: { refs: readonly AbilityRef[]; names: ReadonlyMap<string, string>; label: string }) {
  const chips = refs.flatMap((r) => {
    const m = REF.exec(r);
    return m && names.has(m[1]!) ? [{ ref: r, id: m[1]!, slot: m[2] as Slot }] : [];
  });
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={label}>
      {chips.map((c) => (
        <li key={c.ref}>
          <AbilityRefLink anchor={abilityAnchor(c.id, c.slot)}>{abilityName(names.get(c.id)!, c.slot)}</AbilityRefLink>
        </li>
      ))}
    </ul>
  );
}

function Point({ kind, text, refs, names }: { kind: "threat" | "opportunity"; text: string; refs: readonly AbilityRef[]; names: ReadonlyMap<string, string> }) {
  const threat = kind === "threat";
  const Icon = threat ? TriangleAlert : Crosshair;
  return (
    <div className="min-w-0 space-y-2 px-3 py-3 sm:px-4" data-testid={`briefing-${kind}`}>
      <h3 className={threat ? "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-warn" : "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-good"}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {threat ? "Threat" : "Opportunity"}
      </h3>
      <p className="text-md leading-snug text-fg">{text}</p>
      <AbilityChips refs={refs} names={names} label={threat ? "The threat rests on" : "The opportunity rests on"} />
    </div>
  );
}

/** The ten-second briefing for your champion against the enemy. */
export function Briefing({ matchup, you, enemy }: { matchup: MatchupIntelView; you: ChampionChoice; enemy: ChampionChoice }) {
  const names = new Map([
    [you.id, you.name],
    [enemy.id, enemy.name],
  ]);
  const f = freshnessWords(matchup.freshness, matchup.verified.patch);
  const { threat, opportunity, lane } = matchup.briefing;
  return (
    <Panel className="overflow-hidden" data-testid="matchup-briefing">
      <PanelHeader
        title={`${you.name} vs ${enemy.name}: the ten-second briefing`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="matchup-briefing-checked">
            <span>{f.checked}</span>
            {f.warning ? (
              <Badge tone="warn">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {f.warning}
              </Badge>
            ) : null}
          </span>
        }
      />
      <div className="@container/brief">
        <div className="grid divide-y divide-border @min-[40rem]/brief:grid-cols-2 @min-[40rem]/brief:divide-x @min-[40rem]/brief:divide-y-0">
          <Point kind="threat" text={threat.text} refs={threat.basedOn} names={names} />
          <Point kind="opportunity" text={opportunity.text} refs={opportunity.basedOn} names={names} />
        </div>
        {lane.length ? (
          <section className="border-t border-border px-3 py-3 sm:px-4" aria-labelledby="briefing-lane-title" data-testid="briefing-lane">
            <h3 id="briefing-lane-title" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-label text-fg-subtle">
              <Waypoints className="h-4 w-4 shrink-0" aria-hidden />
              In lane
            </h3>
            <ul className="mt-2 grid gap-x-6 gap-y-3 @min-[40rem]/brief:grid-cols-2">
              {lane.map((p, i) => (
                <li key={i} className="min-w-0 space-y-1.5 border-l-2 border-border pl-3">
                  <p className="text-sm leading-relaxed text-fg">{p.text}</p>
                  <AbilityChips refs={p.basedOn} names={names} label="This point rests on" />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Panel>
  );
}

/** The links to the curated matchups that exist for your champion. */
export function CuratedLinks({ you, enemies, current, label }: { you: ChampionChoice; enemies: readonly ChampionChoice[]; current?: string | null; label: string }) {
  if (!enemies.length) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="matchup-curated-links">
      <span className="text-fg-muted">{label}</span>
      {enemies.map((e) => (
        <Link key={e.id} href={matchupHref(you.id, e.id)} prefetch={false} aria-current={e.id === current ? "page" : undefined} className="touch-target inline-flex min-h-7 items-center rounded-full border border-border-strong bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-accent/60 hover:text-fg" data-testid="matchup-curated-link" data-champion={e.id}>
          {you.name} vs {e.name}
        </Link>
      ))}
    </p>
  );
}

/** No curated briefing for this pair: said once, calmly, and what follows is the enemy's general reference. */
export function NoBriefing({ you, enemy, curatedForYou }: { you: ChampionChoice; enemy: ChampionChoice; curatedForYou: readonly ChampionChoice[] }) {
  return (
    <div className="space-y-2 rounded-panel border border-border bg-surface/60 px-4 py-3" data-testid="matchup-no-briefing">
      <p className="text-sm font-medium text-fg">
        No curated briefing for {you.name} vs {enemy.name} yet.
      </p>
      <p className="text-sm text-fg-muted">What follows is the general reference for {enemy.name}: abilities, base cooldowns and the checked notes that exist.</p>
      <CuratedLinks you={you} enemies={curatedForYou} label={`Curated for ${you.name}:`} />
    </div>
  );
}
