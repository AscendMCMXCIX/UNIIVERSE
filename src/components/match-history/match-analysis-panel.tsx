"use client";

import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { BASELINE_GAMES, BASELINE_MIN, BEST_MIN, LANE_MINUTES, QUEUE_GROUP_WORDS, figureText, placeOf, standingText, type LaneMoment, type PersonalComparison } from "@/domain/match-analysis";
import type { MatchTimelineResult } from "@/server/accounts/match-timeline";
import type { ComparisonFigure, DetailParticipant, MatchDetailView } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { formatCount, formatKilo } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  The Analysis section of a match's breakdown: plain comparisons, each saying what it compares
  with. Within the game (the player's share of their team; their place among the ten; the lane
  opponent at 10:00, 15:00 and the end), against the player's own previous games of the same role
  and kind of queue (never a score: no figure is weighted against another), and the objectives and
  vision Riot recorded for them. Everything but the lane's 10:00 and 15:00 comes from the stored
  game; those two come from the match timeline, read when this section opens.
*/

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const int = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatCount(v));
const signed = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${digits ? Math.abs(n).toFixed(digits) : formatCount(Math.abs(n))}`;
const diffTone = (n: number | null) => (n === null || Math.abs(n) < 0.5 ? "text-fg-muted" : n > 0 ? "text-good" : "text-bad");
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

export function AnalysisPanel({ view, champ, timeline }: { view: MatchDetailView; champ: (id: string | null) => PortraitChampion; timeline: MatchTimelineResult | null }) {
  const everyone = view.teams.flatMap((t) => t.participants);
  const opponent = view.comparison.opponent ? (everyone.find((p) => p.slot === view.comparison.opponent!.slot) ?? null) : null;
  return (
    <div className="grid gap-x-6 gap-y-5 @min-[48rem]/bd:grid-cols-2" data-testid="match-comparison">
      <div className="space-y-5">
        <Shares view={view} />
        <Lane me={view.player} opponent={opponent} champ={champ} timeline={timeline} />
        <Places view={view} everyone={everyone} />
      </div>
      <div className="space-y-5">
        <Personal personal={view.personal} />
        <Objectives view={view} />
      </div>
    </div>
  );
}

function SectionTitle({ id, children, tip }: { id: string; children: React.ReactNode; tip?: React.ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-1.5 text-sm font-semibold text-fg">
      {children}
      {tip}
    </h3>
  );
}

function ShareBar({ label, value, help }: { label: string; value: number | null; help: string }) {
  return (
    <div title={help}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-semibold tabular-nums text-fg">{pct(value)}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-accent/80" style={{ width: `${Math.round(Math.min(1, value ?? 0) * 100)}%` }} />
      </div>
    </div>
  );
}

function Shares({ view }: { view: MatchDetailView }) {
  const id = React.useId();
  const c = view.comparison;
  return (
    <section aria-labelledby={id} className="space-y-2" data-testid="match-shares">
      <SectionTitle id={id}>Your share of the team</SectionTitle>
      <ShareBar label="Champion damage" value={c.damageShare} help="Your damage to champions as a share of your team's" />
      <ShareBar label="Gold" value={c.goldShare} help="Your gold earned as a share of your team's" />
      <ShareBar label="Kill participation" value={c.killParticipation} help="Kills and assists as a share of your team's kills" />
    </section>
  );
}

/** One difference with the two values under it: "+7" over "82 · 75". */
function DiffCell({ you, them, digits = 0, loading = false }: { you: number | null | undefined; them: number | null | undefined; digits?: number; loading?: boolean }) {
  if (loading) return <span className="inline-block h-6 w-12 animate-pulse rounded bg-surface-2 motion-reduce:animate-none" aria-label="Loading" />;
  if (you === null || you === undefined || them === null || them === undefined) return <span className="text-fg-subtle">—</span>;
  const d = you - them;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cn("font-semibold", diffTone(d))}>{signed(d, digits)}</span>
      <span className="text-2xs text-fg-subtle">
        {digits ? you.toFixed(digits) : formatCount(you)} · {digits ? them.toFixed(digits) : formatCount(them)}
      </span>
    </span>
  );
}

function Lane({ me, opponent, champ, timeline }: { me: DetailParticipant; opponent: DetailParticipant | null; champ: (id: string | null) => PortraitChampion; timeline: MatchTimelineResult | null }) {
  const id = React.useId();
  if (!opponent)
    return (
      <section aria-labelledby={id} className="space-y-1.5" data-testid="lane-comparison" data-state="none">
        <SectionTitle id={id}>Lane</SectionTitle>
        <p className="text-xs text-fg-muted">Riot did not record positions clearly enough to pair a lane opponent in this game, so none is shown.</p>
      </section>
    );
  const c = champ(opponent.championId);
  const lane = timeline?.status === "ok" ? timeline.timeline.lane : null;
  // The timeline's moments only when they are about the same opponent the record names.
  const moments = lane && lane.opponentSlot === opponent.slot ? lane.moments : null;
  const loading = !timeline;
  // A row for each minute the timeline holds both players at (placeholders while it loads); the others are named in the note.
  const rows: LaneMoment[] = loading ? LANE_MINUTES.map((minute) => ({ minute, you: null, opponent: null })) : (moments ?? []).filter((m) => m.you && m.opponent);
  const unreached = (moments ?? []).filter((m) => !m.you || !m.opponent).map((m) => `${m.minute}:00`);
  const note = !timeline ? null : timeline.status !== "ok" ? timeline.message : !moments ? "The timeline does not hold both players' figures, so 10:00 and 15:00 are not shown." : unreached.length ? `No ${unreached.join(" or ")} ${unreached.length === 1 ? "row: the game's timeline ends before it" : "rows: the game's timeline ends before them"}.` : null;
  const name = opponent.name?.split("#")[0] ?? c.name;
  return (
    <section aria-labelledby={id} className="space-y-1.5" data-testid="lane-comparison" data-state={moments ? "timeline" : "end"}>
      <SectionTitle
        id={id}
        tip={<InfoTip label="About the lane comparison" text="The enemy Riot recorded in the same position as you (its reading of where each player spent the game), only when exactly one enemy has it. Each cell is your figure minus theirs, with both under it. 10:00 and 15:00 are read from the match timeline between its minute frames; the last row is the end of the game." />}
      >
        Lane against
        <ChampionPortrait champion={c} size="xs" className="h-5 w-5 rounded text-4xs" title={c.name} />
        <span className="min-w-0 truncate font-normal text-fg-muted" title={opponent.name ?? undefined}>
          {name}
        </span>
      </SectionTitle>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">You against your lane opponent: your figure minus theirs, then both figures</caption>
        <thead>
          <tr className="text-left text-2xs text-fg-subtle">
            <th scope="col" className="py-1 font-normal">
              <span className="sr-only">Moment</span>
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              CS
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Gold
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Experience
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((m) => (
            <tr key={m.minute} data-testid={`lane-at-${m.minute}`}>
              <th scope="row" className="py-1.5 text-left text-xs font-normal text-fg-muted">
                {m.minute}:00
              </th>
              <td className="py-1.5 text-right">
                <DiffCell you={m.you?.cs} them={m.opponent?.cs} loading={loading} />
              </td>
              <td className="py-1.5 text-right">
                <DiffCell you={m.you?.gold} them={m.opponent?.gold} loading={loading} />
              </td>
              <td className="py-1.5 text-right">
                <DiffCell you={m.you?.xp} them={m.opponent?.xp} loading={loading} />
              </td>
            </tr>
          ))}
          <tr data-testid="lane-at-end">
            <th scope="row" className="py-1.5 text-left text-xs font-normal text-fg-muted">
              End
            </th>
            <td className="py-1.5 text-right">
              <DiffCell you={me.cs} them={opponent.cs} />
            </td>
            <td className="py-1.5 text-right">
              <DiffCell you={me.gold} them={opponent.gold} />
            </td>
            <td className="py-1.5 text-right" title="Champion level at the end of the game">
              {me.champLevel !== null && opponent.champLevel !== null ? (
                <span className="inline-flex flex-col items-end leading-tight">
                  <span className={cn("font-semibold", diffTone(me.champLevel - opponent.champLevel))}>{signed(me.champLevel - opponent.champLevel)}</span>
                  <span className="text-2xs text-fg-subtle">
                    Level {me.champLevel} · {opponent.champLevel}
                  </span>
                </span>
              ) : (
                <span className="text-fg-subtle">—</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      {note ? (
        <p className="text-2xs text-fg-subtle" data-testid="lane-note">
          {note}
        </p>
      ) : null}
    </section>
  );
}

/**
 * This game beside the player's previous games of the same role and kind of queue: for each figure,
 * how many of them it is higher than ("Higher than 11 of 28", in counts rather than a percentage),
 * a marker on a track from their lowest to their highest share, their median, and "best" only above
 * every one of at least BEST_MIN of them.
 */
function Personal({ personal }: { personal: PersonalComparison | null }) {
  const id = React.useId();
  const method = `Your previous games in the same role and the same kind of queue (ranked with ranked, normal with normal, Swiftplay and Quickplay together, Clash apart), at most ${BASELINE_GAMES}, newest first; this game and later ones never count. Each figure says how many of those games it is higher than; the track places it among them (a tie counts half), and the mark at the middle is their median. A figure is compared once ${BASELINE_MIN} games carry it, and called your best only when it is higher than every one of at least ${BEST_MIN}. No figure is weighted against another, and nothing here is a score.`;
  if (!personal)
    return (
      <section aria-labelledby={id} className="space-y-1.5" data-testid="personal-comparison" data-state="none">
        <SectionTitle id={id} tip={<InfoTip label="About this comparison" text={method} />}>
          Compared with your usual
        </SectionTitle>
        <p className="text-xs text-fg-muted">Not enough earlier games to compare with: it needs {BASELINE_MIN} of your previous games in the same role and kind of queue, with the role recorded.</p>
      </section>
    );
  const games = Math.max(...personal.figures.map((f) => f.games));
  const group = QUEUE_GROUP_WORDS[personal.group];
  return (
    <section aria-labelledby={id} className="space-y-2" data-testid="personal-comparison" data-state="ok">
      <SectionTitle id={id} tip={<InfoTip label="About this comparison" text={method} />}>
        Compared with your usual
      </SectionTitle>
      <p className="-mt-1 text-2xs text-fg-subtle" data-testid="personal-sample">
        Your last {games} {group} {games === 1 ? "game" : "games"} as {ROLE_LABELS[personal.role as Role] ?? personal.role}
      </p>
      <ul className="space-y-2.5">
        {personal.figures.map((f) => (
          <li key={f.key} data-testid={`personal-${f.key}`} data-best={f.best || undefined}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-fg-muted">
                {f.label} <span className="font-semibold tabular-nums text-fg">{figureText(f.key, f.value)}</span>
              </span>
              <span className={cn("shrink-0 tabular-nums", f.best ? "font-semibold text-accent" : "text-fg-muted")} data-testid="personal-standing">
                {standingText(f)}
              </span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-surface-3" aria-hidden>
              <span className="absolute inset-y-0 left-1/2 w-px bg-fg-subtle/60" />
              <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg-elevated bg-accent" style={{ left: `${Math.round(Math.min(1, Math.max(0, f.percentile)) * 100)}%` }} />
            </div>
            <div className="mt-0.5 text-2xs tabular-nums text-fg-subtle">
              Median {figureText(f.key, f.median)} · highest before {figureText(f.key, f.top)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const PLACE_OF: Record<ComparisonFigure["key"], (p: DetailParticipant) => number | null> = {
  csPerMin: (p) => p.csPerMin,
  damagePerMin: (p) => p.damagePerMin,
  goldPerMin: (p) => p.goldPerMin,
  vision: (p) => p.vision,
};

/** Each figure beside the lane opponent and the player's team average, and the player's place among everyone in the game. */
function Places({ view, everyone }: { view: MatchDetailView; everyone: DetailParticipant[] }) {
  const id = React.useId();
  const c = view.comparison;
  const present = everyone.filter((p) => !p.removed);
  const me = present.find((p) => p.isPlayer) ?? null;
  const show = (key: ComparisonFigure["key"], v: number | null) => (v === null ? "—" : key === "csPerMin" ? v.toFixed(1) : formatCount(v));
  return (
    <section aria-labelledby={id} className="space-y-1.5" data-testid="match-places">
      <SectionTitle id={id}>In this game</SectionTitle>
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">Your figures beside your lane opponent and your team&apos;s average, and your place among the players in the game</caption>
        <thead>
          <tr className="text-left text-2xs text-fg-subtle">
            <th scope="col" className="py-1 font-normal">
              <span className="sr-only">Figure</span>
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              You
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Lane opp.
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Team avg.
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Place
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {c.figures.map((f) => {
            const get = PLACE_OF[f.key];
            const place = me ? placeOf(present, me, get) : null;
            const counted = present.filter((p) => get(p) !== null).length;
            return (
              <tr key={f.key} data-testid={`place-${f.key}`}>
                <th scope="row" className="py-1.5 text-left text-xs font-normal text-fg-muted">
                  {f.label}
                </th>
                <td className="py-1.5 text-right font-semibold text-fg">{show(f.key, f.you)}</td>
                <td className="py-1.5 text-right text-fg-muted">{c.opponent ? show(f.key, f.opponent) : "—"}</td>
                <td className="py-1.5 text-right text-fg-muted">{show(f.key, f.teamAverage)}</td>
                <td className="py-1.5 text-right text-fg-muted" title={place === null ? undefined : `${ordinal(place)} highest of the ${counted} players with this figure`}>
                  {place === null ? "—" : `${ordinal(place)} of ${counted}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** The objectives and vision Riot recorded for the player, then the two teams' totals. */
function Objectives({ view }: { view: MatchDetailView }) {
  const id = React.useId();
  const p = view.player;
  const s = p.stats;
  // The team's towers, for the player's part in them (only when the two agree: a takedown is a tower the team destroyed).
  const towers = view.comparison.teams.find((t) => t.key === "tower")?.own ?? null;
  const turrets = s?.turretTakedowns;
  const firstBlood = s ? (s.firstBloodKill ? "Kill" : s.firstBloodAssist ? "Assist" : s.firstBloodKill === false ? "No" : null) : null;
  const items: Array<[string, string, string | null]> = [
    ["Turret takedowns", towers !== null && turrets !== undefined && turrets <= towers ? `Towers you destroyed or helped destroy, of the ${int(towers)} your team destroyed` : "Towers you destroyed or helped destroy", turrets === undefined ? null : towers !== null && turrets <= towers ? `${int(turrets)} of ${int(towers)}` : int(turrets)],
    ["Objective damage", "Damage to epic monsters, towers and inhibitors", s?.objectiveDamage !== undefined ? int(s?.objectiveDamage) : null],
    ["Building damage", "Damage to towers and inhibitors", s?.buildingDamage !== undefined ? int(s?.buildingDamage) : null],
    ["Wards placed", "Wards placed in the game", p.wardsPlaced !== null ? int(p.wardsPlaced) : null],
    ["Wards destroyed", "Enemy wards destroyed", s?.wardsKilled !== undefined ? int(s?.wardsKilled) : null],
    ["Control wards", "Control wards bought", s?.controlWardsBought !== undefined ? int(s?.controlWardsBought) : null],
    ["Crowd control", "Seconds of crowd control applied to enemy champions", s?.ccSeconds !== undefined ? `${int(s?.ccSeconds)}s` : null],
    ["Solo kills", "Kills with no ally helping", s?.soloKills !== undefined ? int(s?.soloKills) : null],
    ["First blood", "The game's first kill", firstBlood],
    ["Killing spree", "Largest killing spree", s?.largestKillingSpree !== undefined ? int(s?.largestKillingSpree) : null],
  ];
  const shown = items.filter(([, , v]) => v !== null);
  return (
    <section aria-labelledby={id} className="space-y-2.5" data-testid="match-objectives">
      <SectionTitle id={id}>Objectives and vision</SectionTitle>
      {shown.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs @min-[30rem]/bd:grid-cols-3">
          {shown.map(([label, help, value]) => (
            <div key={label} className="min-w-0" title={help}>
              <dt className="truncate text-2xs text-fg-subtle">{label}</dt>
              <dd className="font-semibold tabular-nums text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-fg-muted">Riot did not send these figures for this game.</p>
      )}
      <div className="space-y-2" data-testid="team-totals">
        <div className="flex items-baseline justify-between text-2xs text-fg-subtle">
          <span>Your team</span>
          <span>Enemy team</span>
        </div>
        {view.comparison.teams
          .filter((t) => t.own !== null || t.enemy !== null)
          .map((t) => {
            const a = t.own ?? 0;
            const b = t.enemy ?? 0;
            const share = a + b > 0 ? a / (a + b) : 0.5;
            const text = (v: number | null) => (v === null ? "—" : t.key === "gold" || t.key === "damage" ? formatKilo(v) : String(v));
            return (
              <div key={t.key} data-testid={`team-total-${t.key}`}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold tabular-nums text-fg">{text(t.own)}</span>
                  <span className="text-fg-muted">{t.label}</span>
                  <span className="tabular-nums text-fg-muted">{text(t.enemy)}</span>
                </div>
                {/* Your team in blue and the other in red, whichever side they played on: as on the Timeline. */}
                <div className="mt-1 flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="rounded-l-full bg-blue/70" style={{ width: `${Math.round(share * 100)}%` }} />
                  <div className="flex-1 rounded-r-full bg-red/70" />
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
