import { ChevronDown, ChevronsUp, Flame, Footprints, HeartPulse, History, Link2, Lock, Shield, Timer, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AbilityView, ChampionChoice, ChampionIntelView, CooldownDisplay, FactKind, FactView, Slot } from "@/domain/matchup-intel/types";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { RemoteImage } from "@/components/ui/remote-image";
import { NO_BREAK, SourceLink } from "./source-link";
import { FACT_KINDS, SLOT_NAMES, abilityAnchor, changedAbilitiesWords, cooldownLines, cooldownSourceWords, dataSourceWords, expiredNotesWords, flaggedNotesWords, freshnessWords, missingAbilitiesWords, modifierWords, notRecheckedWords, recastWords, revisionWords, subjectWords } from "./wording";

/*
  One champion's abilities, P Q W E R, one row each (docs/MATCHUP_INTEL.md): the icon, the key and
  the name; the base cooldown at each rank (one line per form for a champion who transforms), or
  plainly why there is no number, and under it where the line comes from (checked notes, or Riot's
  data that no person has reviewed); the wait between casts, refunds and resets; recasts; the
  checked facts as badges, each with an icon and a word (never colour alone), and who has the
  effect where its kind would not say; Riot's short description; and, where curated notes exist, a
  details part (the native details element: it works before the page's code has run, and with the
  keyboard) with the longer notes and each fact's source. Once Riot's data moved after the check,
  the line is Riot's, and the notes, their cooldown as checked included, sit under a flag that says
  they may be out of date. On a phone the icon sits beside the name and the cooldown only, and the
  rest takes the row's whole width under them; where the list is wide (a desktop) the description
  sits beside the numbers. Rows carry an anchor, so the briefing's chips can jump to them.
*/

/** Each kind of fact: its icon and its badge's tone (the word says it too). */
const KIND_LOOK: Record<FactKind, { icon: LucideIcon; tone: BadgeTone }> = {
  "crowd-control": { icon: Lock, tone: "bad" },
  mobility: { icon: Footprints, tone: "info" },
  defence: { icon: Shield, tone: "blue" },
  sustain: { icon: HeartPulse, tone: "good" },
  damage: { icon: Flame, tone: "warn" },
  empowerment: { icon: ChevronsUp, tone: "warn" },
  interaction: { icon: Link2, tone: "accent" },
  exception: { icon: TriangleAlert, tone: "neutral" },
};

/**
 * A fact's badge: its kind's icon, the kind for screen readers, the fact's own word, and who has the
 * effect where its kind would not say. The word and who has it are one run of text, so where the
 * badge is narrow (a large text size) they wrap as one, never held side by side past its edge.
 */
export function FactBadge({ kind, label, subject = null }: { kind: FactKind; label: string; subject?: string | null }) {
  const { icon: Icon, tone } = KIND_LOOK[kind];
  return (
    <Badge tone={tone} className="py-1">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{FACT_KINDS[kind]}: </span>
      <span>
        {label}
        {subject ? <span className="font-normal"> · {subject}</span> : null}
      </span>
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

/**
 * A note after a cooldown's numbers, " · starts when the effect ends": the dot is held to what comes
 * before it by a no-break space, so a wrapped line ends with the dot and never starts with one.
 */
function LineNote({ note }: { note: string }) {
  return <span className="text-fg-muted">{`\u00a0· ${note}`}</span>;
}

/** The cooldown's line, or one line per form: the numbers (or why there are none) and their notes. */
function CooldownValue({ cooldown, isStatic, testId }: { cooldown: CooldownDisplay; isStatic: boolean; testId: string }) {
  const lines = cooldownLines(cooldown, { static: isStatic });
  const value = (known: boolean) => (known ? "font-semibold tabular-nums text-fg" : "text-fg-muted");
  if (lines.length === 1 && lines[0]!.form === null) {
    const line = lines[0]!;
    return (
      <>
        <span className={value(line.known)} data-testid={testId}>
          {line.value}
        </span>
        {line.notes.map((n) => (
          <LineNote key={n} note={n} />
        ))}
      </>
    );
  }
  return (
    <span className="mt-0.5 block min-w-0 space-y-0.5" data-testid={testId}>
      {lines.map((line, i) => (
        <span key={`${line.form}-${i}`} className="block" data-testid="ability-cooldown-form">
          <span className="font-medium text-fg">{line.form}:</span> <span className={value(line.known)}>{line.value}</span>
          {line.notes.map((n) => (
            <LineNote key={n} note={n} />
          ))}
        </span>
      ))}
    </span>
  );
}

/** The cooldown's line in the page's flow of words (no flex boxes, so a note wraps as words do), after a clock. */
function CooldownLine({ cooldown, isStatic, testId, label, lineTestId }: { cooldown: CooldownDisplay; isStatic: boolean; testId: string; label?: string; lineTestId: string }) {
  return (
    <p className="text-sm" data-testid={lineTestId}>
      {label ? <span className="mr-1.5 text-fg-muted">{label}</span> : <Timer className="mr-1.5 inline h-3.5 w-3.5 align-[-0.125rem] text-fg-subtle" aria-hidden />}
      {label ? null : <span className="sr-only">Cooldown:</span>}
      <CooldownValue cooldown={cooldown} isStatic={isStatic} testId={testId} />
    </p>
  );
}

/** The curated parts of a row: the wait between casts, refunds and resets, the cooldown's own note, the recast and the badges. */
function CuratedParts({ ability: a, championName }: { ability: AbilityView; championName: string }) {
  const modifiers = modifierWords(a.modifiers);
  return (
    <>
      {modifiers.length ? (
        <ul className="space-y-0.5 text-sm text-fg-muted" data-testid="ability-modifiers">
          {modifiers.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {a.cooldownNote ? <p className="text-sm text-fg-muted">{a.cooldownNote}</p> : null}
      {a.recast ? (
        <p className="text-sm text-fg-muted" data-testid="ability-recast">
          <span className="font-medium text-fg">{recastWords(a.recast)}</span>
          {a.recast.note ? `: ${a.recast.note}` : null}
        </p>
      ) : null}
      {a.facts.length ? (
        <ul className="flex flex-wrap gap-1.5 pt-0.5" aria-label={`What ${a.name} does, checked`} data-testid="ability-facts">
          {a.facts.map((f, i) => (
            <li key={`${f.kind}-${f.label}-${i}`} data-tags={f.tags.length ? f.tags.join(" ") : undefined}>
              <FactBadge kind={f.kind} label={f.label} subject={subjectWords(f.kind, f.appliesTo, championName)} />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

/** A fact in the details: its word, who has it where its kind would not say, its sentence and its source. */
function FactDetail({ fact: f, championName }: { fact: FactView; championName: string }) {
  const subject = subjectWords(f.kind, f.appliesTo, championName);
  const revision = revisionWords(f.source.revisionTime);
  return (
    <li>
      <span className="font-medium text-fg">{f.label}</span>
      {subject ? ` (${subject})` : null}
      {f.detail ? `: ${f.detail}` : null}
      {f.source.title ? (
        <span className="text-fg-subtle">
          {" "}
          · Source: <SourceLink source={f.source} />
          {revision ? `${NO_BREAK}, ${revision}` : null}
        </span>
      ) : null}
    </li>
  );
}

function AbilityRow({ champion, ability: a, checkedPatch, dataPatch, notRecheckedFor }: { champion: ChampionChoice; ability: AbilityView; checkedPatch: string | null; dataPatch: string | null; notRecheckedFor: string | null }) {
  const flagged = a.freshness === "changed-since";
  const source = cooldownSourceWords(a.cooldown, { freshness: a.freshness, checkedPatch, dataPatch, notRecheckedFor });
  const details = a.details.length > 0 || a.facts.length > 0;
  return (
    // A chip's jump lands here and gives the row the focus until it moves on (jumpToAnchor,
    // ability-ref-link.tsx); the row is lit while it holds it.
    <li id={abilityAnchor(champion.id, a.slot)} className="scroll-mt-4 px-3 py-3.5 transition-colors focus:bg-accent/5 focus-visible:-outline-offset-2 sm:px-4" data-testid="ability-row" data-slot={a.slot} data-freshness={a.freshness ?? undefined}>
      {/* By the list's width (container queries, in rem, so they follow the text size):
          - under 16rem (a phone at a large text size: from 150%, or 125% on a 320px phone): one
            column, the icon above the words, which beside it would be a column a word wide;
          - from 16rem (a phone): the icon beside the key, the name and the cooldown only; the notes,
            the description and the details take the row's whole width under them (the two
            wrappers are display: contents, so their parts join this grid);
          - from 28rem: the icon beside all the words;
          - from 46rem (a desktop): the description and the details beside the numbers. */}
      <div className="grid grid-cols-1 gap-x-3 gap-y-2 @min-[16rem]/abilities:grid-cols-[3rem_minmax(0,1fr)] @min-[46rem]/abilities:gap-x-4">
        <AbilityIcon src={a.icon} slot={a.slot} />
        <div className="contents @min-[28rem]/abilities:block @min-[28rem]/abilities:min-w-0 @min-[28rem]/abilities:space-y-2 @min-[46rem]/abilities:grid @min-[46rem]/abilities:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] @min-[46rem]/abilities:gap-x-6 @min-[46rem]/abilities:space-y-0">
          <div className="contents @min-[28rem]/abilities:block @min-[28rem]/abilities:min-w-0 @min-[28rem]/abilities:space-y-1.5">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <KeyChip slot={a.slot} />
                <h3 className="min-w-0 text-md font-semibold leading-snug text-fg" data-testid="ability-name">
                  {a.name}
                </h3>
                {flagged ? (
                  <Badge tone="warn" title="Riot's data for this ability changed after the curated notes were checked: they may be out of date">
                    Changed since the check
                  </Badge>
                ) : null}
              </div>
              <div>
                {/* The notes' static modifier belongs to their line only: once Riot's data moved, it goes with the flagged notes. */}
                <CooldownLine cooldown={a.cooldown} isStatic={!flagged && a.modifiers?.static === true} testId="ability-cooldown-value" lineTestId="ability-cooldown" />
                {source ? (
                  <p className="text-xs text-fg-subtle" data-testid="ability-cooldown-source">
                    {source}
                  </p>
                ) : null}
              </div>
            </div>
            {flagged ? (
              <div className="col-[1/-1] min-w-0 space-y-1.5 border-l-2 border-warn/40 pl-3" data-testid="ability-flagged-notes">
                <p className="flex items-start gap-1.5 text-xs font-medium text-warn">
                  <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{flaggedNotesWords(checkedPatch, a.changes)}</span>
                </p>
                {a.checkedCooldown ? <CooldownLine cooldown={a.checkedCooldown} isStatic={a.modifiers?.static === true} testId="ability-checked-cooldown-value" label="As checked:" lineTestId="ability-checked-cooldown" /> : null}
                <CuratedParts ability={a} championName={champion.name} />
              </div>
            ) : (
              <div className="col-[1/-1] min-w-0 space-y-1.5 empty:hidden">
                <CuratedParts ability={a} championName={champion.name} />
              </div>
            )}
          </div>
          <div className="col-[1/-1] min-w-0 space-y-1.5 empty:hidden @min-[46rem]/abilities:col-auto">
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
                {/* A rule down its side and a small indent from 28rem; on a phone the rule alone, so
                    the notes keep the row's width. */}
                <div className="mt-1 space-y-2 border-l-2 border-border pl-2 text-sm leading-relaxed text-fg-muted @min-[28rem]/abilities:pl-3" data-testid="ability-details-body">
                  {flagged ? <p className="text-xs font-medium text-warn">{flaggedNotesWords(checkedPatch, a.changes)}</p> : null}
                  {a.details.map((d, i) => (
                    <p key={i}>{d}</p>
                  ))}
                  {a.facts.length ? (
                    <ul className="space-y-1.5">
                      {a.facts.map((f, i) => (
                        <FactDetail key={`${f.kind}-${f.label}-${i}`} fact={f} championName={champion.name} />
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

/** "26.22" for Data Dragon "16.22.1"; null without a version. */
function publicPatchOf(version: string | null): string | null {
  const patch = version ? patchFromVersion(version) : null;
  return patch ? publicPatchName(patch) : null;
}

/** One champion's ability rows, or what is missing: none stored yet, or a stored copy that cannot be read. */
export function AbilityList({ intel, testId }: { intel: ChampionIntelView; testId?: string }) {
  if (!intel.abilities || intel.abilities.length === 0) {
    const missing = missingAbilitiesWords(intel.champion.name, intel.abilitiesUnreadable);
    return (
      <div className="p-3 sm:p-4">
        <EmptyState compact icon={Timer} title={missing.title} testId="matchup-abilities-missing">
          {missing.body}
        </EmptyState>
      </div>
    );
  }
  const checkedPatch = intel.curated?.verified.patch ?? null;
  const dataPatch = publicPatchOf(intel.dataVersion);
  const notRecheckedFor = intel.curated?.recheck?.patch ?? null;
  return (
    <ol className="@container/abilities divide-y divide-border" aria-label={`${intel.champion.name}'s abilities`} data-testid={testId}>
      {/* Keyed by champion as well: another pair's rows start afresh, never with a details part
          the reader opened on a different champion's ability. */}
      {intel.abilities.map((a) => (
        <AbilityRow key={`${intel.champion.id}-${a.slot}`} champion={intel.champion} ability={a} checkedPatch={checkedPatch} dataPatch={dataPatch} notRecheckedFor={notRecheckedFor} />
      ))}
    </ol>
  );
}

/**
 * How fresh a champion's curated notes are: when they were checked; that nobody has checked them
 * again for a later patch (a quiet badge); and a warning when Riot changed some of their abilities
 * since, or more than two patches have come since the check.
 */
export function CuratedLine({ intel }: { intel: ChampionIntelView }) {
  if (!intel.curated) return null;
  const f = freshnessWords(intel.curated.freshness, intel.curated.verified.patch);
  const recheck = intel.curated.recheck;
  const changed = (intel.abilities ?? []).filter((a) => a.freshness === "changed-since").length;
  const warnings = [...(changed > 0 ? [changedAbilitiesWords(changed)] : f.warning ? [f.warning] : []), ...(recheck?.expired ? [expiredNotesWords(recheck.patches)] : [])];
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1" data-testid="matchup-curated-checked">
      <span>Curated notes: {f.checked.charAt(0).toLowerCase() + f.checked.slice(1)}</span>
      {recheck && !recheck.expired ? (
        <span className="inline-flex max-w-full" data-testid="matchup-not-rechecked">
          <Badge tone="neutral">
            <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {notRecheckedWords(recheck.patch)}
          </Badge>
        </span>
      ) : null}
      {warnings.map((w) => (
        <Badge key={w} tone="warn">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {w}
        </Badge>
      ))}
    </span>
  );
}

/** Where a champion's abilities come from, as a label after a "·": "Riot Data Dragon 16.22.1", or "Offline copy of …"; null without a version. */
export function dataSourceOf(intel: Pick<ChampionIntelView, "dataVersion" | "offlineCopy">): string | null {
  return intel.dataVersion ? dataSourceWords(intel.dataVersion, intel.offlineCopy, true) : null;
}

/** A champion's abilities as a panel: the heading says once that the cooldowns are base values, without ability haste, and where they come from. */
export function AbilitiesPanel({ intel, title, testId }: { intel: ChampionIntelView; title: string; testId: string }) {
  const from = dataSourceOf(intel);
  return (
    <Panel className="overflow-hidden" data-testid={testId} data-champion={intel.champion.id}>
      <PanelHeader
        title={title}
        subtitle={
          <span className="flex flex-col gap-1">
            <span>Base cooldowns, without ability haste{from ? ` · ${from}` : ""}</span>
            <CuratedLine intel={intel} />
          </span>
        }
      />
      <AbilityList intel={intel} testId={`${testId}-list`} />
    </Panel>
  );
}
