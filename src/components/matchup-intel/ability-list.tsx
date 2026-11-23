import { Fragment } from "react";
import { TierLabel } from "./evidence-panel";
import { EqualNot, History, Timer, TriangleAlert } from "lucide-react";
import { Fold } from "@/components/ui/fold";
import { ChangedBadge } from "./changed-badge";
import type { AbilityView, ChampionChoice, ChampionIntelView, CooldownDisplay, FactView, Slot } from "@/domain/matchup-intel/types";
import { abilityChips, factsFrom } from "@/domain/matchup-intel/kit";
import { cooldownFrom } from "@/domain/matchup-intel/cooldown";
import { patchFromVersion, publicPatchName } from "@/domain/patch";
import { Badge } from "@/components/ui/badge";
import { HasteLine } from "./haste-line";
import { HasteControl } from "./matchup-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import { RemoteImage } from "@/components/ui/remote-image";
import { cn } from "@/lib/cn";
import { AbilityPeekButton, type AbilityPeekItem } from "./ability-peek";
import { CHIP_ROWS, ConditionalNote, DifferQuotes, FactChipView } from "./fact-chip";
import { NO_BREAK, SourceLink } from "./source-link";
import {
  CHECKED_NOTES_LABEL,
  CONDITIONAL_WORDS,
  DIFFER_NEITHER_WORDS,
  DIFFER_WORDS,
  NO_ABILITY_FACTS_WORDS,
  RIOT_TEXT_KIND_WORDS,
  RIOT_TEXT_LABEL,
  SLOT_NAMES,
  SOURCES_FOLD_WORDS,
  alsoDescribedWords,
  abilityAnchor,
  changedAbilitiesWords,
  cooldownLines,
  cooldownSourceWords,
  cooldownsFromWords,
  dataSourceWords,
  expiredNotesWords,
  flaggedNotesWords,
  freshnessWords,
  hiddenRiotTextWords,
  interactionsMoreWords,
  moreWords,
  missingAbilitiesWords,
  modifierWords,
  noFactsWords,
  noneRecordedWords,
  notRecheckedWords,
  qualifierWords,
  recastWords,
  revisionWords,
  riotTextReviewedWords,
  riotChangedLead,
  riotTextSourceWords,
  subjectWords,
} from "./wording";

/*
  One champion's abilities, P Q W E R, one compact tile each, always in that order (docs/MATCHUP_INTEL.md,
  "The ability tiles"):
  - the icon, the key and the name;
  - the base cooldown at each rank (one line per form for a champion who transforms), or plainly why
    there is no number, and where the line comes from (checked notes, or Riot's data no person has
    reviewed);
  - the facts as chips, each with an icon and a word (never colour alone) that open what they rest
    on: checked facts (L2) where the champion has notes, else the kinds Riot's own text names (L3),
    else nothing, which the panel says in words; recasts, charges, refunds and resets among them;
  - the wait between casts, refunds, resets and recasts the checked notes state, in one short line;
  - a Details window with the rest: Riot's description, each fact with its source or quoted
    clause, the notes' longer words.
  Once Riot's data moved after the check, the line is Riot's and the tile is flagged; the notes, their
  cooldown as checked included, are in the window under the flag. Facts from Riot's text whose text
  changed since the review are hidden, and the tile says how many and why. Tiles carry an anchor, so
  the briefing's chips can jump to them.
*/

/** The key an ability is cast with, or "Passive". */
function KeyChip({ slot, corner = false }: { slot: Slot; /** On the icon's corner, its letter only ("P" for the passive): the name is read with the key before it. */ corner?: boolean }) {
  if (corner)
    return (
      <span aria-hidden className="absolute bottom-0 right-0 grid h-4 min-w-4 place-items-center rounded-sm border border-border-strong bg-surface-2 px-0.5 text-2xs font-semibold leading-none text-fg-muted" data-testid="ability-key">
        {slot}
      </span>
    );
  return <span className="inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface-2 px-1 text-2xs font-semibold text-fg-muted">{SLOT_NAMES[slot]}</span>;
}

/** The ability's icon from Data Dragon, lazy; its key on a plain tile when there is none or it fails to load. `small`: the one that starts a narrow tile's key line. */
function AbilityIcon({ src, slot, small = false }: { src: string | null; slot: Slot; small?: boolean }) {
  const size = small ? "h-8 w-8" : "h-10 w-10";
  const standIn = (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-md border border-border bg-surface-2 font-semibold text-fg-subtle", size, small ? "text-xs" : "text-sm")} data-testid="ability-icon-standin">
      {slot}
    </span>
  );
  if (!src) return standIn;
  return <RemoteImage src={src} fallback={standIn} alt="" width={small ? 32 : 40} height={small ? 32 : 40} loading="lazy" decoding="async" className={cn("shrink-0 rounded-md border border-border bg-surface-2 object-cover", size)} />;
}

/**
 * A note after a cooldown's numbers, " · starts when the effect ends": the dot is held to what comes
 * before it by a no-break space, so a wrapped line ends with the dot and never starts with one.
 */
function LineNote({ note }: { note: string }) {
  return <span className="text-fg-muted">{` · ${note}`}</span>;
}

/** The cooldown's line, or one line per form: the numbers (or why there are none) and their notes. */
function CooldownValue({ cooldown, isStatic, testId, big = false }: { cooldown: CooldownDisplay; isStatic: boolean; testId: string; big?: boolean }) {
  const lines = cooldownLines(cooldown, { static: isStatic });
  const value = (known: boolean) => (known ? `font-semibold tabular-nums text-fg ${big ? "text-md leading-tight @min-[15rem]/tile:text-lg" : ""}` : "text-fg-muted");
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
    <span className="block min-w-0 space-y-0.5" data-testid={testId}>
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
function CooldownLine({ cooldown, isStatic, testId, label, lineTestId, source, bare = false }: { cooldown: CooldownDisplay; isStatic: boolean; testId: string; label?: string; lineTestId: string; source?: string | null; /** A tile's line, its figures the tile's largest type: no clock before them (the room is the figures'). */ bare?: boolean }) {
  return (
    <p className="text-sm leading-snug" data-testid={lineTestId}>
      {label ? <span className="mr-1.5 text-fg-muted">{label}</span> : bare ? null : <Timer className="mr-1 inline h-3.5 w-3.5 align-[-0.125rem] text-fg-subtle" aria-hidden />}
      {label ? null : <span className="sr-only">Cooldown:</span>}
      <CooldownValue cooldown={cooldown} isStatic={isStatic} testId={testId} big={!label} />
      {source ? (
        <>
          <span aria-hidden className="text-2xs text-fg-subtle">{" · "}</span>
          {/* Kept whole ("Not reviewed" never split over two lines): it wraps as one piece after the value. */}
          <span className="inline-block text-2xs text-fg-subtle" data-testid="ability-cooldown-source">
            {source}
          </span>
        </>
      ) : null}
    </p>
  );
}

/** A checked fact in the details window: its word, who has it where its kind would not say, its sentence and its source. */
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
          · from <SourceLink source={f.source} />
          {revision ? `${NO_BREAK}, ${revision}` : null}
        </span>
      ) : null}
    </li>
  );
}

/** A small heading inside the details window. */
function DetailsHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="label-caps mb-1 text-fg-subtle">{children}</h3>;
}

/** The checked notes' cooldown parts in words: the wait between casts, refunds and resets, the cooldown's own note, the recast and its note. */
function CooldownParts({ ability: a }: { ability: AbilityView }) {
  const modifiers = modifierWords(a.modifiers);
  return (
    <>
      {modifiers.length ? (
        <ul className="space-y-0.5 text-fg-muted" data-testid="ability-details-modifiers">
          {modifiers.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      {a.cooldownNote ? <p className="text-fg-muted">{a.cooldownNote}</p> : null}
      {a.recast ? (
        <p className="text-fg-muted" data-testid="ability-recast">
          <span className="font-medium text-fg">{recastWords(a.recast)}</span>
          {a.recast.note ? `: ${a.recast.note}` : null}
        </p>
      ) : null}
    </>
  );
}

/** Everything the tile leaves out, for its Details window: the cooldown in full, every fact with what it rests on, the notes, Riot's description. */
export function AbilityDetailsBody({ champion, ability: a, intel, source, checkedPatch }: { champion: ChampionChoice; ability: AbilityView; intel: ChampionIntelView; source: string | null; checkedPatch: string | null }) {
  const flagged = a.freshness === "changed-since";
  const chips = abilityChips(a).filter((c) => c.layer !== "checked");
  const hidden = hiddenWordsOf(a);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg">
      <section>
        <DetailsHeading>Base cooldown, without ability haste</DetailsHeading>
        <CooldownLine cooldown={a.cooldown} isStatic={!flagged && a.modifiers?.static === true} testId="ability-details-cooldown-value" lineTestId="ability-details-cooldown" />
        {source ? <p className="text-xs text-fg-subtle">{source}</p> : null}
        {flagged ? null : <CooldownParts ability={a} />}
      </section>
      {flagged ? (
        <section className="space-y-1.5 border-l-2 border-warn/40 pl-3" data-testid="ability-flagged-notes">
          <p className="flex items-start gap-1.5 text-xs font-medium text-warn">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{flaggedNotesWords(checkedPatch, a.changes)}</span>
          </p>
          {a.checkedCooldown ? <CooldownLine cooldown={a.checkedCooldown} isStatic={a.modifiers?.static === true} testId="ability-checked-cooldown-value" label="As checked:" lineTestId="ability-checked-cooldown" /> : null}
          <CooldownParts ability={a} />
        </section>
      ) : null}
      {a.facts.length ? (
        <section>
          <DetailsHeading>Checked facts</DetailsHeading>
          <p className="mb-1.5 text-xs text-fg-muted" data-testid="ability-details-checked-label">
            {CHECKED_NOTES_LABEL}.
          </p>
          <ul className="space-y-1.5 text-fg-muted">
            {a.facts.map((f, i) => (
              <FactDetail key={`${f.kind}-${f.label}-${i}`} fact={f} championName={champion.name} />
            ))}
          </ul>
        </section>
      ) : null}
      {chips.length || hidden ? (
        <section data-testid="ability-details-riot-text">
          <DetailsHeading>Facts from Riot&apos;s ability text</DetailsHeading>
          <p className="mb-1.5 text-xs text-fg-muted">
            {RIOT_TEXT_LABEL}
            {intel.riotText ? `. ${riotTextReviewedWords(intel.riotText.patch, intel.riotText.reviewedOn)}.` : "."}
          </p>
          {chips.length ? (
            <ul className="space-y-1.5">
              {chips.map((c, i) =>
                c.layer === "riot-text" ? (
                  // The kind, with the marker where the fact is conditional; the clause and its text; the
                  // qualifier's line; another kind Riot's other text words it as.
                  <li key={c.kind} data-testid="ability-details-fact" data-kind={c.kind}>
                    <span className="font-medium">{RIOT_TEXT_KIND_WORDS[c.kind]}</span>
                    {c.fact.conditional ? <span className="text-fg-muted">{` · ${CONDITIONAL_WORDS}`}</span> : null}
                    <span className="block text-fg-muted">
                      “{c.fact.clause}” <span className="text-fg-subtle">({riotTextSourceWords(c.fact.source, a.name)})</span>
                    </span>
                    {c.fact.qualifier ? (
                      <span className="block text-fg-muted" data-testid="ability-details-qualifier">
                        {qualifierWords(c.kind, c.fact.qualifier, c.fact.qualifierSource, a.name)}
                      </span>
                    ) : null}
                    {c.fact.alsoDescribedAs ? (
                      <span className="block text-fg-muted" data-testid="ability-details-also">
                        {alsoDescribedWords(c.fact.alsoDescribedAs.kind, c.fact.alsoDescribedAs.source)}: “{c.fact.alsoDescribedAs.clause}”
                      </span>
                    ) : null}
                  </li>
                ) : c.layer === "riot-text-differ" ? (
                  <li key={`differ-${i}`} data-testid="ability-details-differ">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <EqualNot className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {DIFFER_WORDS}
                    </span>
                    <DifferQuotes disagreement={c.disagreement} ability={a.name} lineClassName="block text-fg-muted" />
                    <span className="block text-fg-subtle">{DIFFER_NEITHER_WORDS}</span>
                  </li>
                ) : null,
              )}
            </ul>
          ) : null}
          {hidden ? <p className="text-xs text-fg-muted">{hidden}</p> : null}
        </section>
      ) : null}
      {a.details.length ? (
        <section>
          <DetailsHeading>Notes</DetailsHeading>
          <div className="space-y-1.5 text-fg-muted">
            {a.details.map((d, i) => (
              <p key={i}>{d}</p>
            ))}
          </div>
        </section>
      ) : null}
      {a.description ? (
        <section>
          <DetailsHeading>Riot&apos;s description</DetailsHeading>
          <p className="text-fg-muted" data-testid="ability-description">
            {a.description}
          </p>
        </section>
      ) : null}
    </div>
  );
}

/**
 * One ability's tile: in the enemy's cooldown strip (`strip`: five side by side on a wide screen, one
 * under another on a phone) or in a champion's kit. Its icon beside the key, the name and the button
 * that opens its Peek; under them the base cooldown, large; then its facts as chips. In the strip a
 * champion's checked interactions and exceptions (how it meets other mechanics: "Blocked abilities
 * still stack", "Stack display hidden from other champions") stay one step away, counted, in its Peek
 * and in the full reference's interactions: the strip keeps what changes a trade, crowd control,
 * mobility, defence, sustain, power and how the cooldown behaves.
 */
function AbilityTile({ intel, ability: a, checkedPatch, notRecheckedFor, dataPatch, commonSource, strip }: { intel: ChampionIntelView; ability: AbilityView; checkedPatch: string | null; dataPatch: string | null; notRecheckedFor: string | null; commonSource: string | null; strip: boolean }) {
  const champion = intel.champion;
  const flagged = a.freshness === "changed-since";
  const source = cooldownSourceWords(a.cooldown, { freshness: a.freshness, checkedPatch, dataPatch, notRecheckedFor });
  const ownSource = source === commonSource ? null : source;
  const all = abilityChips(a);
  const chips = strip ? all.filter((c) => !(c.layer === "checked" && c.group === null)) : all;
  const more = all.length - chips.length;
  // The checked notes' modifiers and recast in one short line; once Riot's data moved, they go with the flagged notes in the Peek.
  const notes = flagged ? [] : [...modifierWords(a.modifiers), ...(a.recast ? [recastWords(a.recast)] : [])];
  const hidden = hiddenWordsOf(a);
  const from = factsFrom(intel);
  const peekId = `${champion.id}.${a.slot}`;
  const name = `${a.name}, ${SLOT_NAMES[a.slot]}`;
  // The interactions and exceptions left out of the strip: counted, one press away in the Peek, after the chips.
  const moreButton = more ? (
    <AbilityPeekButton id={peekId} name={name} testId="ability-more" className="text-left">
      <span aria-hidden>{moreWords(more)}</span>
      <span className="sr-only">{`${interactionsMoreWords(more)}: ${name}`}</span>
    </AbilityPeekButton>
  ) : null;
  return (
    // A chip's jump lands here and gives the tile the focus until it moves on (jumpToAnchor,
    // ui/section-index.tsx); the tile is lit while it holds it. Laid out by its own width (a container):
    // the icon beside the key, the name and the cooldown from 11rem; in a narrower tile (a phone at a
    // large text size) a smaller copy starts the key's line and the words take the whole width (the
    // hidden copy is display: none, and a lazy image out of the layout is never fetched).
    <li id={abilityAnchor(champion.id, a.slot)} className="@container/tile min-w-0 scroll-mt-4 px-2 py-2 transition-colors lg:py-1.5 focus:bg-accent/5 focus-visible:-outline-offset-2 sm:px-3" data-testid="ability-row" data-slot={a.slot} data-freshness={a.freshness ?? undefined}>
      {/* The icon (its key on its corner) beside the name and the Peek's button; the cooldown under them:
          in the name's column in a list (a phone, a tablet, your kit's fold under 50rem), across the whole
          tile where the five stand side by side (each 14 to 20rem, the figures need the width), and with
          no icon column under 11rem (a phone at a large text size), where a smaller icon starts the
          name's line. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-2.5 [grid-template-areas:'name'_'cd'] @min-[11rem]/tile:grid-cols-[2.5rem_minmax(0,1fr)] @min-[11rem]/tile:@max-[50rem]/abilities:[grid-template-areas:'icon_name'_'icon_cd'] @min-[11rem]/tile:@min-[50rem]/abilities:[grid-template-areas:'icon_name'_'cd_cd']">
        <span className="relative hidden [grid-area:icon] @min-[11rem]/tile:block">
          <AbilityIcon src={a.icon} slot={a.slot} />
          <KeyChip slot={a.slot} corner />
        </span>
        {/* The name and the Peek's button; the key read before the name. */}
        <div className="flex min-w-0 items-start gap-x-1.5 [grid-area:name]">
          <span className="relative shrink-0 @min-[11rem]/tile:hidden">
            <AbilityIcon src={a.icon} slot={a.slot} small />
            <KeyChip slot={a.slot} corner />
          </span>
          <span className="sr-only">{`${SLOT_NAMES[a.slot]}: `}</span>
          <h3 className="min-w-0 flex-1 pt-0.5 text-sm font-semibold leading-snug text-fg [overflow-wrap:break-word]" data-testid="ability-name">
            {a.name}
          </h3>
          <AbilityPeekButton id={peekId} name={name} />
        </div>
        <div className="min-w-0 [grid-area:cd]">
          {/* The base cooldown, large, on a line of its own: the figures read first. */}
          <div className="mt-1">
            <CooldownLine cooldown={a.cooldown} isStatic={!flagged && a.modifiers?.static === true} testId="ability-cooldown-value" lineTestId="ability-cooldown" source={flagged ? null : ownSource} bare />
          </div>
          {/* Once Riot changed the ability, where its line now comes from, under the numbers. */}
          {flagged && ownSource ? (
            <p className="text-2xs leading-snug text-fg-subtle" data-testid="ability-cooldown-source">
              {ownSource}
            </p>
          ) : null}
          {/* At the haste chosen in the strip's header (none at 0): a line of its own, so the base line never moves. */}
          <HasteLine basis={a.haste} />
        </div>
      </div>
      <div className="mt-1 space-y-0.5 empty:hidden pointer-coarse:mt-3">
        {/* Once Riot changed the ability: its badge first, before the facts it flags (a row of its own
            where there are none); the flagged notes themselves are in the Peek, one step away. */}
        {flagged && !chips.length ? (
          <span className="flex" data-testid="ability-changed-badge">
            <ChangedBadge />
          </span>
        ) : null}
        {chips.length ? (
          // Rows of chips with no gap between them: each chip is its badge's own box (fact-chip.tsx), so
          // they touch and never overlap, a chip that wraps included; on a touch screen far enough
          // apart that no chip's 44px area covers another (CHIP_ROWS).
          <ul className={cn("flex flex-wrap", CHIP_ROWS)} aria-label={`What ${a.name} does`} data-testid="ability-facts" data-from={from}>
            {flagged ? (
              <li className="flex items-center" role="presentation" data-testid="ability-changed-badge">
                <ChangedBadge />
              </li>
            ) : null}
            {chips.map((c, i) => (
              <li key={`${c.layer}-${c.layer === "checked" ? c.word : c.layer === "riot-text" ? c.kind : "differ"}-${i}`} data-tags={c.layer === "checked" ? (c.tags.length ? c.tags.join(" ") : undefined) : c.layer === "riot-text" ? c.kind : undefined} data-differ={c.layer === "riot-text-differ" ? `${c.disagreement.description.kind} ${c.disagreement.tooltip.kind}` : undefined}>
                <FactChipView chip={c} champion={champion.name} ability={a.name} />
              </li>
            ))}
            {more ? <li className="flex items-center pl-0.5">{moreButton}</li> : null}
            {/* In the strip, the checked notes' wait between casts, refunds and recasts follow the chips on their row where it has room. */}
            {strip && notes.length ? (
              <li className="flex items-center pl-1 text-xs text-fg-muted" data-testid="ability-modifiers">
                {notes.join(" · ")}
              </li>
            ) : null}
          </ul>
        ) : more ? (
          moreButton
        ) : null}
        {/* Where any fact is conditional: the owner's marker, once, naming the chips it marks. */}
        <ConditionalNote chips={chips} testId="ability-facts-conditional" />
        {hidden ? (
          <p className="flex items-start gap-1.5 text-xs text-fg-muted" data-testid="ability-facts-hidden">
            <History className="mt-px h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
            <span>{hidden}</span>
          </p>
        ) : null}
        {/* An ability with no reviewed fact says so, never "none": no fact of it passed the review, which says nothing of what it does. */}
        {!all.length && !hidden && from !== "none" ? (
          <p className="text-xs text-fg-subtle" data-testid="ability-facts-none">
            {from === "riot-text" ? NO_ABILITY_FACTS_WORDS : noneRecordedWords(from)}
          </p>
        ) : null}
        {notes.length && !(strip && chips.length) ? (
          <p className="text-xs text-fg-muted" data-testid="ability-modifiers">
            {notes.join(" · ")}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/** Each ability's Peek: its name, whose and which key, and everything its tile leaves out. */
export function abilityPeekItemsOf(intel: ChampionIntelView): AbilityPeekItem[] {
  const checkedPatch = intel.curated?.verified.patch ?? null;
  const dataPatch = publicPatchOf(intel.dataVersion);
  const notRecheckedFor = intel.curated?.recheck?.patch ?? null;
  return (intel.abilities ?? []).map((a) => ({
    id: `${intel.champion.id}.${a.slot}`,
    title: a.name,
    description: `${intel.champion.name} · ${SLOT_NAMES[a.slot]}`,
    body: <AbilityDetailsBody champion={intel.champion} ability={a} intel={intel} source={cooldownSourceWords(a.cooldown, { freshness: a.freshness, checkedPatch, dataPatch, notRecheckedFor })} checkedPatch={checkedPatch} />,
  }));
}

/** In place of an ability's facts from Riot's text, and its disagreements, once hidden: how many and why; null when nothing is hidden. */
function hiddenWordsOf(a: AbilityView): string | null {
  const r = a.riotText;
  return r && r.hiddenBecause && (r.hidden > 0 || r.hiddenDisagreements > 0) ? hiddenRiotTextWords(r.hidden, r.hiddenBecause, SLOT_NAMES[a.slot], r.hiddenDisagreements) : null;
}

/** "26.22" for Data Dragon "16.22.1"; null without a version. */
export function publicPatchOf(version: string | null): string | null {
  const patch = version ? patchFromVersion(version) : null;
  return patch ? publicPatchName(patch) : null;
}

/** One champion's ability tiles, or what is missing: none stored yet, or a stored copy that cannot be read. */
export function AbilityList({ intel, testId, strip = false }: { intel: ChampionIntelView; testId?: string; /** The enemy's cooldown strip: five side by side where the panel has room, interactions and exceptions in the Peek. */ strip?: boolean }) {
  if (!intel.abilities || intel.abilities.length === 0) {
    const missing = missingAbilitiesWords(intel.champion.name, intel.abilitiesUnreadable);
    return (
      <div className="p-3">
        <EmptyState compact icon={Timer} title={missing.title} testId="matchup-abilities-missing">
          {missing.body}
        </EmptyState>
      </div>
    );
  }
  const checkedPatch = intel.curated?.verified.patch ?? null;
  const dataPatch = publicPatchOf(intel.dataVersion);
  const notRecheckedFor = intel.curated?.recheck?.patch ?? null;
  const commonSource = commonSourceOf(intel);
  return (
    // Laid out by its own width (container queries, in rem, so they follow the text size): the strip's
    // five tiles side by side from 50rem (a desktop: each 14rem or more), one under another below that
    // (a phone, a tablet's column, a large text size); each tile lays itself out by its own width.
    <div className="@container/abilities">
      <ol className={cn("grid divide-y divide-border", strip && "@min-[50rem]/abilities:grid-cols-5 @min-[50rem]/abilities:divide-x @min-[50rem]/abilities:divide-y-0")} aria-label={`${intel.champion.name}'s abilities`} data-testid={testId}>
        {/* Keyed by champion as well: another pair's tiles start afresh. */}
        {intel.abilities.map((a) => (
          <AbilityTile key={`${intel.champion.id}-${a.slot}`} intel={intel} ability={a} checkedPatch={checkedPatch} dataPatch={dataPatch} notRecheckedFor={notRecheckedFor} commonSource={commonSource} strip={strip} />
        ))}
      </ol>
    </div>
  );
}

/**
 * Where most of a champion's cooldown lines come from, said once in its panel's heading ("Riot's
 * data, not reviewed", "Checked on patch 26.22"): the words every line with a number shares. A tile
 * whose line comes from elsewhere (Riot's newer data once it moved after the check, a line with no
 * number that nobody reviewed) says its own under its numbers. A curated champion's heading dates its
 * checked notes, so their words are common to its lines while most lines with a number have them:
 * once Riot changed one ability after the check, that tile says its own ("Riot's data for patch …,
 * not re-checked", beside its badge) and the others keep leaving the heading's words out, rather than
 * every tile repeating them (each repeat a line, which put the Production check's pair's sources'
 * summary under the fold at 1440 × 900). Otherwise null when the lines with a number disagree, or
 * none has one: then each tile says its own.
 */
export function commonSourceOf(intel: ChampionIntelView): string | null {
  const checkedPatch = intel.curated?.verified.patch ?? null;
  const dataPatch = publicPatchOf(intel.dataVersion);
  const notRecheckedFor = intel.curated?.recheck?.patch ?? null;
  const lines = (intel.abilities ?? []).filter((a) => cooldownLines(a.cooldown).some((l) => l.known));
  const words = lines.map((a) => cooldownSourceWords(a.cooldown, { freshness: a.freshness, checkedPatch, dataPatch, notRecheckedFor }));
  if (words.length && words.every((w) => w !== null && w === words[0])) return words[0]!;
  if (!intel.curated) return null;
  const checked = lines.map((a, i) => (cooldownFrom(a.cooldown) === "curated" ? words[i] : null)).filter((w): w is string => w !== null);
  return checked.length * 2 > words.length && checked.every((w) => w === checked[0]) ? checked[0]! : null;
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
    // In the flow of the words before it (not a box of its own): the line starts where the source
    // line's words end and wraps as words do, each badge kept whole after a space (which a wrapped
    // line drops, so a badge starting one is not indented), so the folded champion's summary
    // and a panel's heading take a row less (a box wrapped whole to a line of its own, and put its
    // first badge on another).
    <span data-testid="matchup-curated-checked">
      <span>Curated notes: {f.checked.charAt(0).toLowerCase() + f.checked.slice(1)}</span>
      {recheck && !recheck.expired ? (
        <>
          {" "}
          <span className="inline-flex max-w-full align-top" data-testid="matchup-not-rechecked">
            <Badge tone="neutral" size="line">
              <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {notRecheckedWords(recheck.patch)}
            </Badge>
          </span>
        </>
      ) : null}
      {warnings.map((w) => (
        <Fragment key={w}>
          {" "}
          <span className="inline-flex max-w-full align-top">
            <Badge tone="warn" size="line">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {w}
            </Badge>
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** Where a champion's facts come from, in words: its checked notes' line, the label of the facts from Riot's text, or that none are recorded. */
export function FactsSourceLine({ intel }: { intel: ChampionIntelView }) {
  const from = factsFrom(intel);
  if (from === "checked") return <CuratedLine intel={intel} />;
  if (from === "riot-text")
    return (
      <span data-testid="matchup-riot-text-label">
        {RIOT_TEXT_LABEL}
        {intel.riotText ? ` · ${riotTextReviewedWords(intel.riotText.patch, intel.riotText.reviewedOn)}` : ""}
      </span>
    );
  return <span data-testid="matchup-no-facts">{noFactsWords(intel.champion.name)}</span>;
}

/**
 * "Riot changed this on 26.24": the champion's Data Dragon record (base stats, or an ability's
 * cooldowns, ranks, charges or text) differs on the newest recorded patch from the one before. Quiet,
 * small type on the row it qualifies; nothing without a change.
 */
export function RiotChangedLabel({ patch, after = false }: { patch: string | null | undefined; /** Continuing the "Riot's data" tier label: "changed on 26.24". */ after?: boolean }) {
  if (!patch) return null;
  return (
    // Inline words, not a box: they wrap as the line's other words do rather than move to a line of their own.
    <span className="text-2xs font-normal text-fg-subtle" data-testid="riot-changed">
      {/* "on 26.24" kept together: the patch never alone on a line. */}
      {riotChangedLead(after)} <span className="whitespace-nowrap">on {patch}</span>
    </span>
  );
}

/** Where a champion's abilities come from, as a label after a "·": "Riot Data Dragon 16.22.1", or "Offline copy of …"; null without a version. */
export function dataSourceOf(intel: Pick<ChampionIntelView, "dataVersion" | "offlineCopy">): string | null {
  return intel.dataVersion ? dataSourceWords(intel.dataVersion, intel.offlineCopy, true) : null;
}

/**
 * Whether a champion's sources line may go one step away, into a fold (the bot lane's kits side by
 * side): not where it carries a warning a reader needs in view, the checked notes' line (not
 * re-checked, changed since, too old) or an offline copy's words.
 */
export function sourcesFold(intel: ChampionIntelView): boolean {
  return factsFrom(intel) !== "checked" && !intel.offlineCopy;
}

/**
 * A champion's ability tiles as a panel: its heading says once that the cooldowns are base values,
 * without ability haste, where they come from, and where the facts come from. `notice`: a line
 * above the tiles (the ability data being older than the game's patch).
 */
export function AbilitiesPanel({ intel, title, testId, notice, haste = false, foldSources = false }: { intel: ChampionIntelView; title: string; testId: string; notice?: React.ReactNode; haste?: boolean; /** The bot lane's two kits side by side: where the facts come from one step away (sourcesFold). */ foldSources?: boolean }) {
  const from = dataSourceOf(intel);
  const common = commonSourceOf(intel);
  const changed = !!intel.riotChangedOn && !intel.offlineCopy;
  const fold = foldSources && sourcesFold(intel);
  // Where the abilities come from (the bar names the version too), and the cooldown lines, once for
  // them all (a curated champion's are its checked notes', which the next words date).
  const rest = (
    <>
      {from && !changed ? `${from} · ` : null}
      {common && !intel.curated ? (
        <>
          <span data-testid="abilities-cooldown-source">{cooldownsFromWords(common)}</span>
          {" · "}
        </>
      ) : null}
      <FactsSourceLine intel={intel} />
    </>
  );
  // `folded`: the summary of the sources' fold, the base line inside it, the tier kept whole (at 320px
  // with 200% text "Riot's / data" split over two lines beside "Sources").
  const lead = (folded: boolean) => (
    <>
      <TierLabel className={cn(changed ? undefined : "mr-1.5", folded && "whitespace-nowrap")}>Riot&apos;s data</TierLabel>
      {changed ? (
        <>
          {" "}
          <RiotChangedLabel patch={intel.riotChangedOn} after />
          {" · "}
        </>
      ) : null}
      {haste && !folded ? "Base cooldowns, without ability haste · " : null}
    </>
  );
  return (
    <Panel className="overflow-hidden" data-testid={testId} data-champion={intel.champion.id}>
      {/* One row where it fits: the title, where the abilities and their facts come from (a quiet line, or
          on a desktop one step away in a fold where it carries no warning), and the haste at its end. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
        {/* A long name (Heimerdinger's) breaks rather than reach past the panel at a larger text size. */}
        <h2 className="min-w-0 text-base font-semibold text-fg [overflow-wrap:anywhere]">{title}</h2>
        <div className="min-w-0 flex-[1_1_14rem]">
          {fold ? null : (
            <p className="text-xs text-fg-muted" data-testid="abilities-source">
              {/* Riot's data, the tier of the abilities' names, icons and base cooldowns, first on the line that
                  says where they come from; the version, unless Riot changed this champion on the newest patch
                  (then "Riot's data changed on 26.24"). An offline copy, or checked notes, keep their words in view. */}
              {lead(false)}
              {rest}
            </p>
          )}
          {fold ? (
            // Where the abilities and their facts come from, one step away at every width, the tier in view:
            // the line took two to four lines of small type above the strip (the noise the redesign of
            // 23 Nov 2026 took away). Not where it carries a warning (sourcesFold).
            <Fold
              variant="inline"
              tone="muted"
              testId={`${testId}-sources`}
              summaryClassName="pointer-fine:min-h-6 [&>[data-fold-chevron]]:order-last"
              bodyClassName="mt-0.5 pointer-coarse:mt-4"
              summary={
                // Its name says whose sources these are: the bot lane's two strips each have one.
                <span className="min-w-0" data-testid="abilities-source-lead">
                  {lead(true)}
                  <span className="sr-only"> · </span>
                  {SOURCES_FOLD_WORDS}
                  <span className="sr-only">{` for ${title}`}</span>
                </span>
              }
            >
              <p className="text-xs text-fg-muted" data-testid="abilities-source-folded">
                {haste ? "Base cooldowns, without ability haste · " : null}
                {rest}
              </p>
            </Fold>
          ) : null}
        </div>
        {/* The haste the cooldowns are also shown at (the first enemy's strip only: one choice for the page). */}
        <div className="ml-auto">{haste ? <HasteControl /> : <p className="text-xs text-fg-muted">Base cooldowns, without ability haste</p>}</div>
      </header>
      {notice}
      <AbilityList intel={intel} testId={`${testId}-list`} strip />
    </Panel>
  );
}

/**
 * Your own champion, folded into one line until asked for (the native details element: it works
 * before the page's code has run, and a chip's jump to one of its tiles opens it). Its summary says
 * where the cooldowns come from once for them all, as the enemy's panel does ("Cooldowns: Riot's
 * data, not reviewed"; a curated champion's are its notes', which their line dates), so its tiles
 * leave it out as theirs do.
 */
export function YourChampion({ intel, label = "Your champion", testId = "matchup-your-abilities", foldSources = false }: { intel: ChampionIntelView; label?: string; testId?: string; /** The bot lane's duo, two folds side by side: the sources line inside the fold, over the tiles (sourcesFold). */ foldSources?: boolean }) {
  const from = dataSourceOf(intel);
  const common = commonSourceOf(intel);
  const changed = !!intel.riotChangedOn && !intel.offlineCopy;
  const inside = foldSources && sourcesFold(intel);
  // Where the abilities come from: in the summary, or (the bot lane's duo) inside the fold, over the
  // tiles, where its five lines in each of two folds side by side pushed the sources' summary under
  // the fold at 1440 × 900 (20 Nov 2026). "Riot's data changed on 26.24" stays in the summary.
  // Inside the fold "Riot's data changed on 26.24" is said once, in the summary.
  const source = (withChanged: boolean) => (
    <>
      {/* As on the enemy's panel: "Riot's data changed on 26.24" in place of the version, which the bar
          names too. Beside the title it grew the summary by a line or two on phones (R11b review). */}
      Abilities and base cooldowns
      {changed && !withChanged ? null : changed ? (
        <>
          {" · Riot's data "}
          <RiotChangedLabel patch={intel.riotChangedOn} after />
        </>
      ) : from ? (
        ` · ${from}`
      ) : (
        ""
      )}
      {common && !intel.curated ? (
        <>
          {" · "}
          <span data-testid="your-cooldown-source">{cooldownsFromWords(common)}</span>
        </>
      ) : null}
      {" · "}
      <FactsSourceLine intel={intel} />
    </>
  );
  return (
    // A section with a heading of its own, so its abilities' headings sit under it: the summary's
    // words are not read as a heading everywhere, so the heading is for screen readers alone.
    <section>
      <h2 className="sr-only">{`${label}: ${intel.champion.name}`}</h2>
      {/* Under 9rem (a 320px phone at twice the text size) the chevron floats at the first line's end
          and the words take the summary's whole width under it, so a long name keeps whole (the
          Fold's chevron is first in the source, for the float; last in the row where the summary is a row). */}
      <Fold
        className="panel-depth"
        testId={testId}
        flush
        summaryClassName="@max-[9rem]/dash:block @max-[9rem]/dash:px-2 @max-[9rem]/dash:[&>[data-fold-chevron]]:float-right @max-[9rem]/dash:[&>[data-fold-chevron]]:ml-1.5 @max-[9rem]/dash:[&>[data-fold-chevron]]:mt-0.5"
        bodyClassName="pointer-coarse:pt-1"
        summary={
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg [overflow-wrap:anywhere]">{`${label}: ${intel.champion.name}`}</span>
            {/* In the bot lane on a desktop (inside) the line moves into the fold, over the tiles, and only
                "Riot's data changed on 26.24" stays here; in one column it stays here, as nothing needs the room. */}
            <span className={cn("block text-xs text-fg-muted", inside && "@min-[60rem]/dash:hidden")} data-testid="your-abilities-source">
              {source(true)}
            </span>
            {inside && changed ? (
              <span className="hidden text-xs text-fg-muted @min-[60rem]/dash:block">
                {"Riot's data "}
                <RiotChangedLabel patch={intel.riotChangedOn} after />
              </span>
            ) : null}
          </span>
        }
      >
        {/* On a touch screen 4px more under the summary, so the first tile's Details button, whose 44px
            area reaches 10px past it, covers none of the summary. */}
        {inside ? (
          <p className="hidden border-b border-border px-3 py-1.5 text-xs text-fg-muted @min-[60rem]/dash:block" data-testid="your-abilities-source-inside">
            {source(false)}
          </p>
        ) : null}
        <AbilityList intel={intel} testId={`${testId}-list`} />
      </Fold>
    </section>
  );
}
