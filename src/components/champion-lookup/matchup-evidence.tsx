"use client";

import * as React from "react";
import type { LaneEvidenceView, LaneQueueEvidence } from "@/domain/matchup/lane-evidence";
import { LANE_QUEUE_KEYS, QUEUE_LABELS, isLaneQueueKey } from "@/domain/matchup/queues";
import {
  FEW_TIP,
  FIRST_BLOOD_LABEL,
  KILLS_LABEL,
  MEDIAN_LABEL,
  MIRROR_WORDS,
  QUEUE_SELECT_LABEL,
  TEAM_TIP,
  TEAM_TITLE,
  UNAVAILABLE_WORDS,
  aheadLabel,
  fewWords,
  killsTip,
  medianSpoken,
  medianTip,
  medianWords,
  noneWords,
  sampleTip,
  sampleWords,
  shareSpoken,
  shareTip,
  shareWords,
  untimedWords,
  wonLabel,
} from "@/domain/matchup/words";
import type { Role } from "@/domain/roles";
import { formatCount } from "@/lib/format";
import { InfoTip } from "@/components/ui/info-tip";
import { Select } from "@/components/ui/select";
import { usePageQueue } from "./page-queue";

/*
  MATCHUP INTEL's "In the team's matches" (docs/MATCHUP_INTEL.md): the lane at 10:00 in the team's
  stored games of this pairing and role, for the page's queue (every queue's figures came with the
  page, so a change reads nothing). Below MIN_LANE_GAMES games, only the number of games; from it,
  the figures, each share with its 95% range behind it, the sample line in the quietest grey.
  Figures in the main text colour, labels in the secondary: no colour says good or bad, and a sign
  carries no tone. Each line wraps between its label and its figures, never inside a figure.
*/

/** A figure that opens its ⓘ is a finger's target on a touch screen (44px tall; 24px under a mouse, the line kept). */
const TOUCH = "pointer-coarse:min-h-11";

const Sep = () => (
  <span aria-hidden className="text-fg-subtle">
    {" · "}
  </span>
);

function Line({ label, children, testId, extra }: { label: string; children: React.ReactNode; testId: string; extra?: Record<string, string | number> }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3" data-testid={testId} {...extra}>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="ml-auto text-right tabular-nums text-fg">{children}</dd>
    </div>
  );
}

/** The figures of one queue, from MIN_LANE_GAMES games. */
function Figures({ e, a, b }: { e: LaneQueueEvidence; a: string; b: string }) {
  const f = e.figures!;
  return (
    <dl className="space-y-0.5 text-sm" data-testid="matchup-figures">
      <Line label={aheadLabel(a)} testId="matchup-ahead" extra={{ "data-n": f.ahead.n, "data-of": f.ahead.of, "data-low": f.ahead.low.toFixed(4), "data-high": f.ahead.high.toFixed(4) }}>
        <InfoTip text={shareTip(f.ahead)} className={TOUCH}>
          <span className="sr-only">{shareSpoken(f.ahead)}</span>
          <span aria-hidden>{shareWords(f.ahead)}</span>
        </InfoTip>
      </Line>
      <Line label={MEDIAN_LABEL} testId="matchup-median" extra={{ "data-gold": f.gold.median, "data-xp": f.xp.median, "data-cs": f.cs?.median ?? "" }}>
        <InfoTip text={medianTip(a, b, f.gold)} className={TOUCH}>
          <span className="sr-only">{medianSpoken({ gold: f.gold.median, cs: f.cs?.median ?? null, xp: f.xp.median }, a, b)}</span>
          <span aria-hidden>{medianWords({ gold: f.gold.median, cs: f.cs?.median ?? null, xp: f.xp.median })}</span>
        </InfoTip>
      </Line>
      {f.kills ? (
        <Line label={KILLS_LABEL} testId="matchup-kills" extra={{ "data-games": f.kills.games }}>
          {/* One text inside the ⓘ's button (a flex box drops the spaces between separate pieces). */}
          <InfoTip text={killsTip(f.kills, a, b)} className={TOUCH}>{`${a} ${formatCount(f.kills.a)}\u00a0· ${b} ${formatCount(f.kills.b)}`}</InfoTip>
        </Line>
      ) : null}
      {f.firstBlood ? (
        <Line label={FIRST_BLOOD_LABEL} testId="matchup-first-blood" extra={{ "data-games": f.firstBlood.games }}>
          {a} {formatCount(f.firstBlood.a)}
          <Sep />
          {b} {formatCount(f.firstBlood.b)}
          <Sep />
          others {formatCount(f.firstBlood.other)}
        </Line>
      ) : null}
      <Line label={wonLabel(a)} testId="matchup-won" extra={{ "data-n": f.won.n, "data-of": f.won.of, "data-low": f.won.low.toFixed(4), "data-high": f.won.high.toFixed(4) }}>
        <InfoTip text={shareTip(f.won)} className={TOUCH}>
          <span className="sr-only">{shareSpoken(f.won)}</span>
          <span aria-hidden>{shareWords(f.won)}</span>
        </InfoTip>
      </Line>
    </dl>
  );
}

/** The block's state words for one queue: none, untimed, few, or the figures with their sample. */
function QueueBody({ e, a, b, role, season, currentPatch }: { e: LaneQueueEvidence; a: string; b: string; role: Role; season: number; currentPatch: string | null }) {
  if (e.stored === 0) return <p className="text-sm text-fg-muted" data-testid="matchup-team-line">{noneWords(a, b, role, e.queue)}</p>;
  if (e.games === 0) return <p className="text-sm text-fg-muted" data-testid="matchup-team-line">{untimedWords(e)}</p>;
  if (!e.figures)
    return (
      <p className="text-sm text-fg-muted" data-testid="matchup-team-line">
        {fewWords(e, season)} <InfoTip label="Why figures show from 10 games" text={FEW_TIP} testId="matchup-few-tip" />
      </p>
    );
  const tip = sampleTip(e, currentPatch);
  return (
    <div className="space-y-1">
      <p className="text-xs text-fg-subtle" data-testid="matchup-sample" data-line={sampleWords(e, season)}>
        {tip ? <InfoTip text={tip} className={TOUCH}>{sampleWords(e, season)}</InfoTip> : sampleWords(e, season)}
      </p>
      <Figures e={e} a={a} b={b} />
    </div>
  );
}

export function LaneEvidenceBlock({ evidence, a, b, role, headingId }: { evidence: LaneEvidenceView; a: string; b: string; role: Role; headingId: string }) {
  const { queue, setQueue } = usePageQueue();
  const e = evidence.status === "counted" ? evidence.queues[queue] : null;
  const state = evidence.status !== "counted" ? evidence.status : e!.stored === 0 ? "none" : e!.figures ? "shown" : "few";
  return (
    <div className="min-w-0 space-y-1.5" data-testid="matchup-team" data-state={state} data-queue={queue} data-games={e?.games ?? 0} data-stored={e?.stored ?? 0}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 id={headingId} className="label-text">
          {TEAM_TITLE}
        </h3>
        <InfoTip label="About the team's matches" text={TEAM_TIP} testId="matchup-team-tip" />
        {evidence.status === "counted" ? (
          <Select
            value={queue}
            options={LANE_QUEUE_KEYS.map((k) => ({ value: k, label: QUEUE_LABELS[k] }))}
            onValueChange={(v) => isLaneQueueKey(v) && setQueue(v)}
            aria-label={QUEUE_SELECT_LABEL}
            className="-my-1 ml-auto h-8 w-auto py-0 text-xs md:pointer-fine:h-8 md:pointer-fine:text-xs pointer-coarse:h-11"
            data-testid="matchup-queue"
          />
        ) : null}
      </div>
      {evidence.status === "unavailable" ? (
        <p className="text-sm text-fg-muted" data-testid="matchup-team-line">
          {UNAVAILABLE_WORDS}
        </p>
      ) : evidence.status === "mirror" ? (
        <p className="text-sm text-fg-muted" data-testid="matchup-team-line">
          {MIRROR_WORDS}
        </p>
      ) : (
        <QueueBody e={e!} a={a} b={b} role={role} season={evidence.season} currentPatch={evidence.currentPatch} />
      )}
    </div>
  );
}
