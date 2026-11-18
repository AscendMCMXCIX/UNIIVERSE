import { ChevronsUp, Flame, Footprints, HeartPulse, Link2, Lock, RotateCcw, Shield, TriangleAlert, type LucideIcon } from "lucide-react";
import type { FactKind, KindGroup } from "@/domain/matchup-intel/types";
import type { FactChip } from "@/domain/matchup-intel/kit";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { FACT_KINDS, KIND_GROUP_WORDS, RIOT_TEXT_KIND_WORDS, RIOT_TEXT_LABEL, revisionWords, riotTextSourceWords, subjectWords } from "./wording";

/*
  A fact as a chip (docs/MATCHUP_INTEL.md, "The ability tiles"): its kind's icon, the kind for screen
  readers, and one word or a few, never colour alone. Every chip opens what it rests on, on hover,
  focus or a tap (the app's one tooltip, InfoTip): a checked fact's own sentence and its source page;
  a kind from Riot's text the clause of Riot's text it quotes, which text it is, and how it was
  reviewed. The same words are the chip's accessible description, so a screen reader hears them
  without opening it. Links to the sources are in the ability's details window, never in a tip.
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

/** What a chip's tip says (also its accessible description): plain inline text, one line per part. */
function ChipTip({ chip, champion, ability }: { chip: FactChip; champion: string; ability: string }) {
  if (chip.layer === "riot-text") {
    return (
      <>
        {chip.clauses.map((c, i) => (
          <span key={i} className="block">
            “{c.clause}” <span className="text-fg-muted">({riotTextSourceWords(c.source, ability)})</span>
          </span>
        ))}
        <span className="mt-1 block text-fg-muted">{RIOT_TEXT_LABEL}.</span>
      </>
    );
  }
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

/** The chip's word: a checked fact's own label, or the kind's word from Riot's text (who has the effect, where its kind would not say, is in its tip). */
export function chipWord(chip: FactChip): string {
  return chip.layer === "riot-text" ? RIOT_TEXT_KIND_WORDS[chip.kind] : chip.word;
}

/** A fact's chip, opening what it rests on. */
export function FactChipView({ chip, champion, ability, testId = "fact-chip" }: { chip: FactChip; champion: string; ability: string; testId?: string }) {
  const look = chip.layer === "checked" ? KIND_LOOK[chip.kind] : GROUP_LOOK[chip.group];
  const kindWord = chip.layer === "checked" ? FACT_KINDS[chip.kind] : KIND_GROUP_WORDS[chip.group];
  const Icon = look.icon;
  return (
    <InfoTip text={<ChipTip chip={chip} champion={champion} ability={ability} />} testId={testId}>
      <Badge tone={look.tone} className="touch-target">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="sr-only">{kindWord}: </span>
        <span>{chipWord(chip)}</span>
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
