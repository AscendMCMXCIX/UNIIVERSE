import { ChevronDown, Flame, Footprints, HeartPulse, Link2, Lock, Shield, Timer, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AbilityView, ChampionChoice, ChampionIntelView, FactKind, Slot } from "@/domain/matchup-intel/types";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { RemoteImage } from "@/components/ui/remote-image";
import { SourceLink } from "./source-link";
import { FACT_KINDS, SLOT_NAMES, abilityAnchor, cooldownWords, freshnessWords, recastWords } from "./wording";

/*
  One champion's abilities, P Q W E R, one row each (docs/MATCHUP_INTEL.md): the icon, the key and
  the name; the base cooldown at each rank, or plainly why there is no number; recasts; the checked
  facts as badges, each with an icon and a word (never colour alone); Riot's short description; and,
  where curated notes exist, a details part (the native details element: it works before the
  page's code has run, and with the keyboard) with the longer notes and each fact's source. On a
  phone a row is one column; where the list is wide (a desktop) the description sits beside the
  numbers. Rows carry an anchor, so the briefing's chips can jump to them.
*/

/** Each kind of fact: its icon and its badge's tone (the word says it too). */
const KIND_LOOK: Record<FactKind, { icon: LucideIcon; tone: BadgeTone }> = {
  "crowd-control": { icon: Lock, tone: "bad" },
  mobility: { icon: Footprints, tone: "info" },
  defence: { icon: Shield, tone: "blue" },
  sustain: { icon: HeartPulse, tone: "good" },
  damage: { icon: Flame, tone: "warn" },
  interaction: { icon: Link2, tone: "accent" },
  exception: { icon: TriangleAlert, tone: "neutral" },
};

/** A fact's badge: its kind's icon, the kind for screen readers, and the fact's own word. */
export function FactBadge({ kind, label }: { kind: FactKind; label: string }) {
  const { icon: Icon, tone } = KIND_LOOK[kind];
  return (
    <Badge tone={tone} className="py-1">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{FACT_KINDS[kind]}: </span>
      {label}
    </Badge>
  );
}

/** The key an ability is cast with, or "Passive". */
function KeyChip({ slot }: { slot: Slot }) {
  return <span className="inline-grid h-6 min-w-6 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs font-semibold text-fg-muted">{SLOT_NAMES[slot]}</span>;
}

/** The ability's icon from Data Dragon, 48px, lazy; its key on a plain tile when there is none or it fails to load. */
function AbilityIcon({ src, slot }: { src: string | null; slot: Slot }) {
  const standIn = (
    <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-border bg-surface-2 text-base font-semibold text-fg-subtle" data-testid="ability-icon-standin">
      {slot}
    </span>
  );
  if (!src) return standIn;
  return <RemoteImage src={src} fallback={standIn} alt="" width={48} height={48} loading="lazy" decoding="async" className="h-12 w-12 shrink-0 rounded-md border border-border bg-surface-2 object-cover" />;
}

function AbilityRow({ champion, ability: a }: { champion: ChampionChoice; ability: AbilityView }) {
  const cd = cooldownWords(a.cooldown);
  const facts = a.facts;
  const details = a.details.length > 0 || facts.length > 0;
  return (
    // A chip's jump lands here and gives the row the focus until it moves on (jumpToAnchor,
    // ability-ref-link.tsx); the row is lit while it holds it.
    <li id={abilityAnchor(champion.id, a.slot)} className="scroll-mt-4 px-3 py-3.5 transition-colors focus:bg-accent/5 focus-visible:-outline-offset-2 sm:px-4" data-testid="ability-row" data-slot={a.slot}>
      <div className="flex gap-3 @min-[46rem]/abilities:gap-4">
        <AbilityIcon src={a.icon} slot={a.slot} />
        <div className="min-w-0 flex-1 @min-[46rem]/abilities:grid @min-[46rem]/abilities:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @min-[46rem]/abilities:gap-x-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <KeyChip slot={a.slot} />
              <h3 className="min-w-0 text-md font-semibold leading-snug text-fg" data-testid="ability-name">
                {a.name}
              </h3>
              {a.freshness === "changed-since" ? (
                <Badge tone="warn" title="Riot's numbers for this ability changed after the curated notes were checked: they may be out of date">
                  Changed since the check
                </Badge>
              ) : null}
            </div>
            <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm" data-testid="ability-cooldown">
              <Timer className="h-3.5 w-3.5 shrink-0 self-center text-fg-subtle" aria-hidden />
              <span className="sr-only">Cooldown:</span>
              <span className={cd.known ? "font-semibold tabular-nums text-fg" : "text-fg-muted"} data-testid="ability-cooldown-value">
                {cd.value}
              </span>
              {cd.notes.map((n) => (
                <span key={n} className="text-fg-muted">
                  · {n}
                </span>
              ))}
            </p>
            {a.cooldownNote ? <p className="text-sm text-fg-muted">{a.cooldownNote}</p> : null}
            {a.recast ? (
              <p className="text-sm text-fg-muted" data-testid="ability-recast">
                <span className="font-medium text-fg">{recastWords(a.recast)}</span>
                {a.recast.note ? `: ${a.recast.note}` : null}
              </p>
            ) : null}
            {facts.length ? (
              <ul className="flex flex-wrap gap-1.5 pt-0.5" aria-label={`What ${a.name} does, checked`} data-testid="ability-facts">
                {facts.map((f, i) => (
                  <li key={`${f.kind}-${f.label}-${i}`}>
                    <FactBadge kind={f.kind} label={f.label} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-2 min-w-0 space-y-1.5 @min-[46rem]/abilities:mt-0">
            {a.description ? (
              <p className="text-sm leading-relaxed text-fg-muted" data-testid="ability-description">
                {a.description}
              </p>
            ) : null}
            {details ? (
              <details className="group/details" data-testid="ability-details">
                <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-1 rounded-md text-sm font-medium text-accent hover:text-accent-strong md:pointer-fine:min-h-8 [&::-webkit-details-marker]:hidden">
                  <ChevronDown className="h-4 w-4 transition-transform group-open/details:rotate-180 motion-reduce:transition-none" aria-hidden />
                  Details and sources
                </summary>
                <div className="mt-1 space-y-2 border-l-2 border-border pl-3 text-sm leading-relaxed text-fg-muted" data-testid="ability-details-body">
                  {a.details.map((d, i) => (
                    <p key={i}>{d}</p>
                  ))}
                  {facts.length ? (
                    <ul className="space-y-1.5">
                      {facts.map((f, i) => (
                        <li key={`${f.kind}-${f.label}-${i}`}>
                          <span className="font-medium text-fg">{f.label}</span>
                          {f.detail ? `: ${f.detail}` : null}
                          {f.source.title ? (
                            <span className="text-fg-subtle">
                              {" "}
                              · Source: <SourceLink source={f.source} />
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

/** One champion's ability rows, or what is missing: ability data arrives with the game-data update. */
export function AbilityList({ intel, testId }: { intel: ChampionIntelView; testId?: string }) {
  if (!intel.abilities || intel.abilities.length === 0) {
    return (
      <div className="p-3 sm:p-4">
        <EmptyState compact icon={Timer} title="Ability details arrive with the next game-data update" testId="matchup-abilities-missing">
          {intel.champion.name}&apos;s abilities are read from Riot&apos;s Data Dragon once per game version, and none are stored yet.
        </EmptyState>
      </div>
    );
  }
  return (
    <ol className="@container/abilities divide-y divide-border" aria-label={`${intel.champion.name}'s abilities`} data-testid={testId}>
      {intel.abilities.map((a) => (
        <AbilityRow key={a.slot} champion={intel.champion} ability={a} />
      ))}
    </ol>
  );
}

/** How fresh a champion's curated notes are, beside its abilities' heading. */
function CuratedLine({ intel }: { intel: ChampionIntelView }) {
  if (!intel.curated) return null;
  const f = freshnessWords(intel.curated.freshness, intel.curated.verified.patch);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="matchup-curated-checked">
      <span>Curated notes: {f.checked.charAt(0).toLowerCase() + f.checked.slice(1)}</span>
      {f.warning ? (
        <Badge tone="warn">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {f.warning}
        </Badge>
      ) : null}
    </span>
  );
}

/** A champion's abilities as a panel: the heading says once that the cooldowns are base values, without ability haste. */
export function AbilitiesPanel({ intel, title, testId }: { intel: ChampionIntelView; title: string; testId: string }) {
  return (
    <Panel className="overflow-hidden" data-testid={testId} data-champion={intel.champion.id}>
      <PanelHeader
        title={title}
        subtitle={
          <span className="flex flex-col gap-1">
            <span>Base cooldowns, without ability haste{intel.dataVersion ? ` · Riot Data Dragon ${intel.dataVersion}` : ""}</span>
            <CuratedLine intel={intel} />
          </span>
        }
      />
      <AbilityList intel={intel} testId={`${testId}-list`} />
    </Panel>
  );
}

