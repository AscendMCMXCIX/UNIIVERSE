import { ChevronsUp, EqualNot, Flame, Footprints, HeartPulse, Link2, Lock, RotateCcw, Shield, TriangleAlert, type LucideIcon } from "lucide-react";
import type { FactKind, KindGroup, RiotTextDisagreementView } from "@/domain/matchup-intel/types";
import type { DifferChip, FactChip, RiotTextChip } from "@/domain/matchup-intel/kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { CONDITIONAL_WORDS, DIFFER_NEITHER_WORDS, DIFFER_WORDS, FACT_KINDS, KIND_GROUP_WORDS, RIOT_TEXT_KIND_WORDS, RIOT_TEXT_LABEL, conditionalNoteWords, differSideWords, qualifierChipWords, qualifierWords, revisionWords, riotTextSourceWords, subjectWords } from "./wording";

/*
  A fact as a chip (docs/MATCHUP_INTEL.md, "The ability tiles"): its kind's icon, the kind for screen
  readers, and one word or a few, never colour alone. Every chip opens what it rests on, on hover,
  focus or a tap (the app's one tooltip, InfoTip): a checked fact's own sentence and its source page;
  a kind from Riot's text the clause of Riot's text it quotes, which text it is, its qualifier, and
  how it was reviewed. The same words are the chip's accessible description, so a screen reader hears
  them without opening it. Links to the sources are in the ability's details window, never in a tip.

  A fact from Riot's text carries on the chip itself what it holds only with, its qualifier, in
  Riot's words ("Stun · “Mega Gnar”", "Cooldown refund of “Mantra”"); a conditional one is named in
  the line under the ability's chips, in the owner's fixed words ("Conditional: see Riot's text (Stun
  and Pull)", ConditionalNote), and its tip says the same with its quote. Where Riot's two texts
  differ, one neutral chip says so ("Riot's texts differ") and opens both quotes, picking neither.
*/

/** Each kind of checked fact: its icon and its chip's tone (the word says it too). */
export const KIND_LOOK: Record<FactKind, { icon: LucideIcon; tone: BadgeTone }> = {
  "crowd-control": { icon: Lock, tone: "bad" },
  mobility: { icon: Footprints, tone: "info" },
  defence: { icon: Shield, tone: "blue" },
  sustain: { icon: HeartPulse, tone: "good" },
  damage: { icon: Flame, tone: "warn" },
  empowerment: { icon: ChevronsUp, tone: "warn" },
  interaction: { icon: Link2, tone: "accent" },
  exception: { icon: TriangleAlert, tone: "neutral" },
};

/** Each group of kinds from Riot's text: the same icons and tones as the checked kinds it matches. */
export const GROUP_LOOK: Record<KindGroup, { icon: LucideIcon; tone: BadgeTone }> = {
  "crowd-control": KIND_LOOK["crowd-control"],
  power: KIND_LOOK.empowerment,
  mobility: KIND_LOOK.mobility,
  defence: KIND_LOOK.defence,
  sustain: KIND_LOOK.sustain,
  cooldown: { icon: RotateCcw, tone: "neutral" },
};

/** A fact from Riot's text, in its tip: the clause and its text, its qualifier's line, the marker, and the label. */
function RiotTextTip({ chip, ability }: { chip: RiotTextChip; ability: string }) {
  const f = chip.fact;
  return (
    <>
      <span className="block">
        “{f.clause}” <span className="text-fg-muted">({riotTextSourceWords(f.source, ability)})</span>
      </span>
      {f.qualifier ? <span className="block">{qualifierWords(chip.kind, f.qualifier, f.qualifierSource, ability)}</span> : null}
      {f.conditional ? <span className="block">{CONDITIONAL_WORDS}.</span> : null}
      <span className="mt-1 block text-fg-muted">{RIOT_TEXT_LABEL}.</span>
    </>
  );
}

/** Where Riot's two texts differ: both quotes, alike and in a fixed order (the description, then the tooltip), and that neither is a fact. */
export function DifferQuotes({ disagreement: d, ability, lineClassName = "block" }: { disagreement: RiotTextDisagreementView; ability: string; lineClassName?: string }) {
  return (
    <>
      <span className={lineClassName} data-testid="differ-description">
        {differSideWords(d.description.kind, "description", ability)}: “{d.description.clause}”
      </span>
      <span className={lineClassName} data-testid="differ-tooltip">
        {differSideWords(d.tooltip.kind, "tooltip", ability)}: “{d.tooltip.clause}”
      </span>
    </>
  );
}

/** What a chip's tip says (also its accessible description): plain inline text, one line per part. */
function ChipTip({ chip, champion, ability }: { chip: FactChip; champion: string; ability: string }) {
  if (chip.layer === "riot-text") return <RiotTextTip chip={chip} ability={ability} />;
  if (chip.layer === "riot-text-differ")
    return (
      <>
        <DifferQuotes disagreement={chip.disagreement} ability={ability} />
        <span className="mt-1 block text-fg-muted">
          {DIFFER_NEITHER_WORDS} {RIOT_TEXT_LABEL}.
        </span>
      </>
    );
  const subject = subjectWords(chip.kind, chip.appliesTo, champion);
  const revision = revisionWords(chip.source.revisionTime);
  return (
    <>
      <span className="block">
        {chip.word}
        {subject ? ` (${subject})` : ""}
        {chip.detail ? `: ${chip.detail}` : ""}
      </span>
      {chip.source.title ? (
        <span className="mt-1 block text-fg-muted">
          Checked notes · Source: {chip.source.title}
          {revision ? `, ${revision}` : ""}
        </span>
      ) : null}
    </>
  );
}

/** The chip's word: a checked fact's own label, the kind's word from Riot's text (who has the effect, where its kind would not say, is in its tip), or that Riot's texts differ. */
export function chipWord(chip: FactChip): string {
  return chip.layer === "riot-text" ? RIOT_TEXT_KIND_WORDS[chip.kind] : chip.layer === "riot-text-differ" ? DIFFER_WORDS : chip.word;
}

/** What a fact from Riot's text holds only with, on its chip after the kind's word: its qualifier, in Riot's words. */
export function chipMarkers(chip: RiotTextChip): string {
  return chip.fact.qualifier ? qualifierChipWords(chip.kind, chip.fact.qualifier) : "";
}

/** The kinds among some chips whose facts are conditional, in the chips' order. */
export function conditionalKinds(chips: readonly FactChip[]): RiotTextChip["kind"][] {
  return chips.flatMap((c) => (c.layer === "riot-text" && c.fact.conditional ? [c.kind] : []));
}

/**
 * The marker's line under an ability's chips, where any of them is conditional: the owner's fixed
 * words, naming the chips it marks ("Conditional: see Riot's text (Stun and Pull)"); each chip's tip
 * gives its quote. One line for the ability, so a long marker never makes each chip a line of its own.
 */
export function ConditionalNote({ chips, testId, className }: { chips: readonly FactChip[]; testId: string; className?: string }) {
  const kinds = conditionalKinds(chips);
  if (!kinds.length) return null;
  return (
    <span className={cn("block text-xs text-fg-muted", className)} data-testid={testId}>
      {conditionalNoteWords(kinds)}
    </span>
  );
}

/**
 * A chip's trigger and badge, sized so that rows of chips never overlap: the trigger is the badge's
 * own box (not the tip's 24px line box with negative margins, which a chip that wraps, at a large
 * text size or with a long qualifier, overlapped the next row with), and the badge's target reaches
 * 24px and more with a pseudo-element that takes no room (44px on touch screens: touch-target). The
 * lists set their rows with no gap between them, so single-line rows keep their density.
 */
const CHIP_TRIGGER = "my-0! min-h-0!";
const CHIP_BADGE = "touch-target text-left before:absolute before:inset-x-0 before:-inset-y-0.5 before:content-['']";

/** The chip "Riot's texts differ": neutral, with its icon and its words, opening both quotes. */
function DifferChipView({ chip, champion, ability, testId }: { chip: DifferChip; champion: string; ability: string; testId: string }) {
  return (
    <InfoTip text={<ChipTip chip={chip} champion={champion} ability={ability} />} testId={`${testId}-differ`} className={CHIP_TRIGGER}>
      <Badge tone="neutral" className={CHIP_BADGE}>
        <EqualNot className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{DIFFER_WORDS}</span>
      </Badge>
    </InfoTip>
  );
}

/** A fact's chip, opening what it rests on. */
export function FactChipView({ chip, champion, ability, testId = "fact-chip" }: { chip: FactChip; champion: string; ability: string; testId?: string }) {
  if (chip.layer === "riot-text-differ") return <DifferChipView chip={chip} champion={champion} ability={ability} testId={testId} />;
  const look = chip.layer === "checked" ? KIND_LOOK[chip.kind] : GROUP_LOOK[chip.group];
  const kindWord = chip.layer === "checked" ? FACT_KINDS[chip.kind] : KIND_GROUP_WORDS[chip.group];
  const markers = chip.layer === "riot-text" ? chipMarkers(chip) : "";
  const Icon = look.icon;
  return (
    <InfoTip text={<ChipTip chip={chip} champion={champion} ability={ability} />} testId={testId} className={CHIP_TRIGGER}>
      {/* A long qualifier wraps inside the chip, its lines starting at the left. */}
      <Badge tone={look.tone} className={CHIP_BADGE}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{kindWord}: </span>
        <span>
          {chipWord(chip)}
          {markers ? (
            <span className="font-normal" data-testid="fact-chip-markers">
              {markers}
            </span>
          ) : null}
        </span>
      </Badge>
    </InfoTip>
  );
}

/** A fact's badge without a tip, for lists that already say what it rests on in full (the details window). */
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
