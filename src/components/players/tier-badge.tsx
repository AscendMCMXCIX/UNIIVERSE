import type { ProficiencyTier } from "@/domain/proficiency";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

export type EvidenceWord = "high" | "medium" | "low" | "none";

const TIER_TONE: Record<ProficiencyTier, BadgeTone> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };
/** A shape per tier as well as a colour, so the label never depends on colour alone. */
const TIER_MARK: Record<ProficiencyTier, string> = { core: "◆◆", strong: "◆", comfortable: "●", moderate: "○", rusty: "◇", unknown: "–" };
const EVIDENCE_BARS: Record<EvidenceWord, number> = { high: 3, medium: 2, low: 1, none: 0 };
const EVIDENCE_TEXT: Record<EvidenceWord, string> = { high: "Plenty of recent games", medium: "Enough games to go on", low: "Few games so far", none: "No games yet" };

const TIER_TEXT: Record<ProficiencyTier, string> = { core: "text-good", strong: "text-good", comfortable: "text-info", moderate: "text-fg-muted", rusty: "text-warn", unknown: "text-fg-subtle" };

/**
 * Experience on the champion in the role (the label) and how far the data supports it (the bars):
 * two different things, side by side, with the reasons one hover away. `quiet` is the restrained
 * form for champion collections: the tier's mark and label in its colour, and the evidence and
 * reasons in the same tip (one quiet line instead of a badge, bars and an ⓘ).
 */
export function TierBadge({ tier, label, why, evidence, compact = false, quiet = false }: { tier: ProficiencyTier; label: string; why: string; evidence: EvidenceWord; compact?: boolean; quiet?: boolean }) {
  const bars = EVIDENCE_BARS[evidence];
  if (quiet)
    return (
      <InfoTip
        label={`Why ${label}`}
        testId="tier-quiet"
        text={
          <>
            {why}
            {tier !== "unknown" ? <span className="mt-1 block text-fg-muted">{EVIDENCE_TEXT[evidence]}.</span> : null}
          </>
        }
      >
        {/* On one line; in a phone's pool row (under 24rem: from a 320px phone at 200% text, where it ran
            past the screen's edge, to a 375px one at 125%, where it lay over the figures) its words wrap,
            the mark staying with the first. Not in the desktop Peek's (28rem): wrapping there, where one
            line fits, narrowed its column and made the rows two and three lines tall (Demo Mid's Peek
            scrolled 11px at 1440 × 900, Release 10's integration). */}
        <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap text-xs font-medium @max-[24rem]/pool:whitespace-normal", TIER_TEXT[tier])} data-tier={tier}>
          <span aria-hidden className="text-2xs">
            {TIER_MARK[tier]}
          </span>
          {label}
          {tier !== "unknown" ? <span className="sr-only">, {EVIDENCE_TEXT[evidence].toLowerCase()}</span> : null}
        </span>
      </InfoTip>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <Badge tone={TIER_TONE[tier]} className={compact ? "px-1.5 py-0 text-2xs" : undefined}>
        <span aria-hidden className="mr-0.5 text-2xs">
          {TIER_MARK[tier]}
        </span>
        {label}
      </Badge>
      {tier !== "unknown" ? (
        <span className="inline-flex h-3 items-end gap-px" title={EVIDENCE_TEXT[evidence]} role="img" aria-label={EVIDENCE_TEXT[evidence]} data-testid="evidence-bars">
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn("w-[3px] rounded-[1px]", i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3", i <= bars ? "bg-fg-muted" : "bg-border")} />
          ))}
        </span>
      ) : null}
      <InfoTip
        text={
          <>
            {why}
            {tier !== "unknown" ? <span className="mt-1 block text-fg-muted">{EVIDENCE_TEXT[evidence]}.</span> : null}
          </>
        }
        label={`Why ${label}`}
      />
    </span>
  );
}
