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
import { DetailsDialog } from "./details-dialog";
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
function KeyChip({ slot }: { slot: Slot }) {
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
  const value = (known: boolean) => (known ? `font-semibold tabular-nums text-fg ${big ? "text-md" : ""}` : "text-fg-muted");
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
function CooldownLine({ cooldown, isStatic, testId, label, lineTestId, source }: { cooldown: CooldownDisplay; isStatic: boolean; testId: string; label?: string; lineTestId: string; source?: string | null }) {
  return (
    <p className="text-sm leading-snug" data-testid={lineTestId}>
      {label ? <span className="mr-1.5 text-fg-muted">{label}</span> : <Timer className="mr-1 inline h-3.5 w-3.5 align-[-0.125rem] text-fg-subtle" aria-hidden />}
      {label ? null : <span className="sr-only">Cooldown:</span>}
      <CooldownValue cooldown={cooldown} isStatic={isStatic} testId={testId} big={!label} />
      {source ? (
        <>
          <span aria-hidden className="text-2xs text-fg-subtle">{" · "}</span>
          <span className="text-2xs text-fg-subtle" data-testid="ability-cooldown-source">
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

function AbilityTile({ intel, ability: a, checkedPatch, dataPatch, notRecheckedFor, commonSource }: { intel: ChampionIntelView; ability: AbilityView; checkedPatch: string | null; dataPatch: string | null; notRecheckedFor: string | null; commonSource: string | null }) {
  const champion = intel.champion;
  const flagged = a.freshness === "changed-since";
  const source = cooldownSourceWords(a.cooldown, { freshness: a.freshness, checkedPatch, dataPatch, notRecheckedFor });
  const ownSource = source === commonSource ? null : source;
  const chips = abilityChips(a);
  // The checked notes' modifiers and recast in one short line; once Riot's data moved, they go with the flagged notes in the window.
  const notes = flagged ? [] : [...modifierWords(a.modifiers), ...(a.recast ? [recastWords(a.recast)] : [])];
  const hidden = hiddenWordsOf(a);
  const from = factsFrom(intel);
  return (
    // A chip's jump lands here and gives the tile the focus until it moves on (jumpToAnchor,
    // ui/section-index.tsx); the tile is lit while it holds it.
    // On a desktop the tiles are 4px shorter (lg:py-1): five of them give the 1440 × 900 fit ~20px of
    // margin, which CI's browser (Chrome 156, which wraps a cooldown's note a line earlier than 153) needs.
    // The icon beside everything from a tile 16rem wide; in a narrower one (a phone at a large text
    // size) a smaller copy starts the key's line instead and the words take the tile's whole width,
    // so a column beside the icon never squeezes them to a few letters a line (the hidden copy is
    // display: none, and a lazy image out of the layout is never fetched).
    <li id={abilityAnchor(champion.id, a.slot)} className="grid scroll-mt-4 grid-cols-1 items-start gap-x-2.5 px-2 py-1.5 transition-colors lg:py-1 focus:bg-accent/5 focus-visible:-outline-offset-2 @min-[16rem]/abilities:grid-cols-[2.5rem_minmax(0,1fr)] @min-[16rem]/abilities:px-3" data-testid="ability-row" data-slot={a.slot} data-freshness={a.freshness ?? undefined}>
      <span className="hidden @min-[16rem]/abilities:block">
        <AbilityIcon src={a.icon} slot={a.slot} />
      </span>
      <div className="min-w-0 space-y-0.5">
        {/* The key and the name, then the cooldown at the line's end where there is room (under them where
            there is not), then the details window's button: the figures line up from tile to tile. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="shrink-0 @min-[16rem]/abilities:hidden">
            <AbilityIcon src={a.icon} slot={a.slot} small />
          </span>
          <KeyChip slot={a.slot} />
          <h3 className="min-w-0 text-sm font-semibold leading-snug text-fg [overflow-wrap:anywhere]" data-testid="ability-name">
            {a.name}
          </h3>

          <span className="flex min-w-0 basis-full items-center justify-between gap-2 @min-[24rem]/abilities:ml-auto @min-[24rem]/abilities:basis-auto @min-[24rem]/abilities:justify-end">
            {/* The notes' static modifier belongs to their line only: once Riot's data moved, it goes with the flagged notes. */}
            <CooldownLine cooldown={a.cooldown} isStatic={!flagged && a.modifiers?.static === true} testId="ability-cooldown-value" lineTestId="ability-cooldown" source={flagged ? null : ownSource} />
            <DetailsDialog label="Details" name={`${a.name}, ${SLOT_NAMES[a.slot]}`} title={a.name} description={`${champion.name} · ${SLOT_NAMES[a.slot]}`} testId="ability-details" bodyTestId="ability-details-body" iconOnly>
              <AbilityDetailsBody champion={champion} ability={a} intel={intel} source={source} checkedPatch={checkedPatch} />
            </DetailsDialog>
          </span>
          {/* Once Riot changed the ability, where its line now comes from, under the numbers: after them it
              took the numbers off the name's row onto two of their own. */}
          {flagged && ownSource ? (
            <p className="basis-full text-2xs leading-snug text-fg-subtle @min-[24rem]/abilities:text-right" data-testid="ability-cooldown-source">
              {ownSource}
            </p>
          ) : null}
          {/* At the haste chosen in the bar (none at 0): a line of its own, so the base line never moves. */}
          <HasteLine basis={a.haste} />
        </div>
        {/* Once Riot changed the ability: its badge first under the name's row, before the facts it flags,
            leading their row (a row of its own where there are none); beside the name it pushed the cooldown
            to a row of its own. The flagged notes themselves are in the Details window, one step away
            (Release 10: on the tile they put the Production check's pair past the 1440 × 900 and
            1280 × 800 fits with an enemy ability changed; docs/MATCHUP_INTEL.md). */}
        {flagged && !chips.length ? (
          <span className="flex" data-testid="ability-changed-badge">
            <ChangedBadge />
          </span>
        ) : null}
        {chips.length ? (
          // Rows of chips with no gap between them: each chip is its badge's own box (fact-chip.tsx), so
          // they touch and never overlap, a chip that wraps included; on a touch screen far enough
          // apart that no chip's 44px area covers another (CHIP_ROWS), and 12px under the key's line,
          // so none covers the Details button there.
          <ul className={cn("flex flex-wrap pointer-coarse:mt-3", CHIP_ROWS)} aria-label={`What ${a.name} does`} data-testid="ability-facts" data-from={from}>
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
          </ul>
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
        {!chips.length && !hidden && from !== "none" ? (
          <p className="text-xs text-fg-subtle" data-testid="ability-facts-none">
            {from === "riot-text" ? NO_ABILITY_FACTS_WORDS : noneRecordedWords(from)}
          </p>
        ) : null}
        {notes.length ? (
          <p className="text-xs text-fg-muted" data-testid="ability-modifiers">
            {notes.join(" · ")}
          </p>
        ) : null}

      </div>
    </li>
  );
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
export function AbilityList({ intel, testId }: { intel: ChampionIntelView; testId?: string }) {
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
    // Laid out by its own width (container queries, in rem, so they follow the text size): from 24rem
    // the cooldown ends the name's line; under it (a phone, a large text size) it takes a line of its
    // own; under 16rem the icon joins the key's line (AbilityTile).
    <ol className="@container/abilities divide-y divide-border" aria-label={`${intel.champion.name}'s abilities`} data-testid={testId}>
      {/* Keyed by champion as well: another pair's tiles start afresh. */}
      {intel.abilities.map((a) => (
        <AbilityTile key={`${intel.champion.id}-${a.slot}`} intel={intel} ability={a} checkedPatch={checkedPatch} dataPatch={dataPatch} notRecheckedFor={notRecheckedFor} commonSource={commonSource} />
      ))}
    </ol>
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
      <header className="space-y-0.5 border-b border-border px-3 py-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          {/* A long name (Heimerdinger's) breaks rather than reach past the panel at a larger text size. */}
          <h2 className="min-w-0 text-sm font-semibold text-fg [overflow-wrap:anywhere]">{title}</h2>
          {/* The haste the cooldowns are also shown at, in the heading's row (the first enemy's panel only:
              one choice for the page); the base line's words then start the source line. */}
          {haste ? <HasteControl /> : <p className="text-xs text-fg-muted">Base cooldowns, without ability haste</p>}
        </div>
        <p className={cn("text-xs text-fg-muted", fold && "@min-[60rem]/dash:hidden")} data-testid="abilities-source">
          {/* Riot's data, the tier of the abilities' names, icons and base cooldowns, first on the line that
              says where they come from (a curated champion's facts say "Checked notes" at its end and on
              each fact). Beside the title it put the haste control on a row of its own at 1440 × 900, 26px
              that, with production's "Not re-checked", the sources' summary could not spare (Production
              check, 20 Nov 2026). The version, unless Riot changed this champion on the newest patch: then
              the words after the tier say so ("Riot's data changed on 26.24"), as the bar names the version
              too. Beside the version, or on the title's row, the label wrapped a line at 1440 × 900
              (16–20px), which put the sources' summary under the fold with production's "Not re-checked".
              An offline copy keeps its words. */}
          {lead(false)}
          {rest}
        </p>
        {fold ? (
          // In the bot lane on a desktop the two enemies' kits stand side by side, each a third of the page
          // wide: their sources there took five or six lines each, which put the cooldown lines under the
          // fold at 1280 × 800 and the sources' summary at 1440 × 900 (20 Nov 2026). The tier stays in view;
          // where the abilities and their facts come from is one step away, in this fold. In one column
          // (a phone, a tablet) nothing needs the room, and the line above stays in view instead.
          <Fold
            variant="inline"
            tone="muted"
            className="hidden @min-[60rem]/dash:block"
            testId={`${testId}-sources`}
            summaryClassName="pointer-fine:min-h-6 [&>[data-fold-chevron]]:order-last"
            bodyClassName="mt-0.5 pointer-coarse:mt-4"
            summary={
              // Its name says whose sources these are: the two kits' folds stand side by side.
              <span className="min-w-0" data-testid="abilities-source-lead">
                {lead(true)}
                <span className="sr-only"> · </span>
                {SOURCES_FOLD_WORDS}
                <span className="sr-only">{` for ${title}`}</span>
              </span>
            }
          >
            <p className="text-xs text-fg-muted" data-testid="abilities-source-folded">
              {/* The first kit's base line, its title's row holding the haste: the second kit's title row says it in view. */}
              {haste ? "Base cooldowns, without ability haste · " : null}
              {rest}
            </p>
          </Fold>
        ) : null}
      </header>
      {notice}
      <AbilityList intel={intel} testId={`${testId}-list`} />
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
