"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { ESTABLISHED_GAMES, recordFor, type EncounterSummary, type EncounterView, type WinLoss } from "@/domain/encounters";
import { getEncounterDetailAction, type EncounterDetailResult } from "@/server/actions/encounters";
import type { EncounterMember } from "@/server/matches/encounters";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar } from "@/components/players/card-look";
import { DetailModal } from "@/components/ui/detail-modal";
import { MatchDetailModal } from "@/components/match-history/match-detail";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  The Encounters list and its windows. A row opens the player's window (their record with and
  against the members, and the recorded games); a game opens the shared match window, with Back
  to the player. Records read as plain counts ("Faced 6 times · 2W 4L"); a percentage appears only
  once ESTABLISHED_GAMES decided games stand behind it.
*/

export interface EncounterInsightView {
  kind: string;
  label: string;
  key: string;
  name: string;
  record: WinLoss;
  relation: "ally" | "opponent";
}

export interface EncounterFilterArgs {
  season: number | null;
  queues: number[] | null;
  playerId: string | null;
  accountId: string | null;
}

const decided = (wl: WinLoss) => wl.wins + wl.losses;
const pct = (wl: WinLoss) => (decided(wl) >= ESTABLISHED_GAMES ? ` · ${Math.round((wl.wins / decided(wl)) * 100)}%` : "");
export const recordText = (wl: WinLoss) => `${wl.wins}W ${wl.losses}L${pct(wl)}`;
const times = (n: number) => `${n} time${n === 1 ? "" : "s"}`;

/** "Name#TAG" with the tag quieter. */
function RiotId({ name, className }: { name: string; className?: string }) {
  const i = name.lastIndexOf("#");
  return (
    <span className={cn("min-w-0 truncate", className)} title={name}>
      <span className="font-semibold text-fg">{i > 0 ? name.slice(0, i) : name}</span>
      {i > 0 ? <span className="text-fg-subtle">{name.slice(i)}</span> : null}
    </span>
  );
}

function SmallSample() {
  return (
    <span className="shrink-0 rounded border border-border px-1 text-[10px] font-medium leading-4 text-fg-subtle" title={`Fewer than ${ESTABLISHED_GAMES} games: a small sample`} data-testid="encounter-small-sample">
      small sample
    </span>
  );
}

function MemberChip({ member, text, relation }: { member: EncounterMember | undefined; text: string; relation: "ally" | "opponent" | null }) {
  if (!member) return null;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] text-fg-muted", relation === "ally" ? "border-blue/30" : relation === "opponent" ? "border-red/30" : "border-border")} data-testid="encounter-member">
      <CardAvatar look={member.look} name={member.name} src={member.avatarUrl} size="xs" />
      <span className="truncate font-medium text-fg">{member.name}</span>
      <span className="shrink-0 tabular-nums">{text}</span>
    </span>
  );
}

export function EncounterBrowser({ view, list, total, moreHref, insights, members, champions, filterArgs }: { view: EncounterView; list: EncounterSummary[]; total: number; moreHref: string | null; insights: EncounterInsightView[]; members: Record<string, EncounterMember>; champions: Record<string, PortraitChampion>; filterArgs: EncounterFilterArgs }) {
  const [open, setOpen] = React.useState<{ key: string; name: string } | null>(null);
  return (
    <div className="space-y-3">
      {insights.length ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" data-testid="encounter-insights">
          {insights.map((i) => (
            <li key={i.kind}>
              <button type="button" onClick={() => setOpen({ key: i.key, name: i.name })} className="flex w-full min-w-0 flex-col items-start gap-0.5 rounded-panel border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent" data-testid="encounter-insight" data-kind={i.kind}>
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{i.label}</span>
                <RiotId name={i.name} className="block w-full text-sm" />
                <span className={cn("text-xs tabular-nums", i.relation === "ally" ? "text-blue" : "text-red")}>
                  {i.relation === "ally" ? "Alongside" : "Faced"} {times(i.record.games)} · {recordText(i.record)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="divide-y divide-border/70 overflow-hidden rounded-panel border border-border bg-surface" data-testid="encounter-list">
        {list.map((s) => {
          const rec = recordFor(s, view);
          const headline = view === "allies" ? `Played alongside ${times(rec.games)}` : view === "opponents" ? `Faced ${times(rec.games)}` : `Met ${times(s.games)} by ${s.members.length} members`;
          return (
            <li key={s.key}>
              <button type="button" onClick={() => setOpen({ key: s.key, name: s.name })} className="relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 pl-4 text-left transition-colors hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" data-testid="encounter-row" data-key={s.key}>
                <span className={cn("absolute inset-y-2 left-0 w-[3px] rounded-r-full", view === "allies" ? "bg-blue" : view === "opponents" ? "bg-red" : "bg-accent")} aria-hidden />
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <RiotId name={s.name} className="text-sm" />
                  <span className={cn("text-xs tabular-nums", view === "allies" ? "text-blue" : view === "opponents" ? "text-red" : "text-fg-muted")} data-testid="encounter-record">
                    {headline}
                    {view !== "shared" ? ` · ${recordText(rec)}` : ""}
                  </span>
                  {rec.games < ESTABLISHED_GAMES ? <SmallSample /> : null}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-fg-subtle">
                  <span className="max-sm:hidden">Last met</span> {formatDate(new Date(s.lastPlayedAt))}
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="col-span-2 flex min-w-0 flex-wrap gap-1.5">
                  {s.members.flatMap((m) => {
                    const chips: React.ReactNode[] = [];
                    if ((view === "allies" || view === "shared") && m.ally.games) chips.push(<MemberChip key={`${m.playerId}-a`} member={members[m.playerId]} relation={view === "shared" ? "ally" : null} text={`${view === "shared" ? "with " : ""}${m.ally.games} · ${m.ally.wins}W ${m.ally.losses}L`} />);
                    if ((view === "opponents" || view === "shared") && m.opponent.games) chips.push(<MemberChip key={`${m.playerId}-o`} member={members[m.playerId]} relation={view === "shared" ? "opponent" : null} text={`${view === "shared" ? "vs " : ""}${m.opponent.games} · ${m.opponent.wins}W ${m.opponent.losses}L`} />);
                    return chips;
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
        <span data-testid="encounter-count">
          {list.length} of {total} shown
        </span>
        {moreHref ? (
          <Link href={moreHref} scroll={false} className="font-medium text-accent hover:underline" data-testid="encounter-more">
            Show more
          </Link>
        ) : null}
      </p>
      {open ? <EncounterWindow target={open} members={members} champions={champions} filterArgs={filterArgs} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function EncounterWindow({ target, members, champions, filterArgs, onClose }: { target: { key: string; name: string }; members: Record<string, EncounterMember>; champions: Record<string, PortraitChampion>; filterArgs: EncounterFilterArgs; onClose: () => void }) {
  const [result, setResult] = React.useState<EncounterDetailResult | null>(null);
  const [match, setMatch] = React.useState<{ playerId: string; matchId: string } | null>(null);
  React.useEffect(() => {
    let live = true;
    void getEncounterDetailAction(target.key, filterArgs)
      .catch((): EncounterDetailResult => ({ status: "not-found", message: "Couldn't load this player right now." }))
      .then((r) => live && setResult(r));
    return () => {
      live = false;
    };
  }, [target.key, filterArgs]);
  const champ = (id: string | null): PortraitChampion => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : { id: "unknown", name: "Unknown", portraitUrl: "" });
  // A game opens the shared match window in place of this one; Back returns here.
  if (match) return <MatchDetailModal playerId={match.playerId} matchId={match.matchId} championsById={champions} onClose={onClose} back={{ label: target.name, onBack: () => setMatch(null) }} />;
  const s = result?.status === "ok" ? result.summary : null;
  return (
    <DetailModal
      open
      onClose={onClose}
      size="standard"
      title={target.name}
      titleId="encounter-title"
      testId="encounter-detail"
      header={
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4 pr-14 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Recorded encounters</p>
            <h2 id="encounter-title" className="text-xl font-bold">
              <RiotId name={s?.name ?? target.name} />
            </h2>
            {s ? (
              <p className="mt-0.5 text-sm text-fg-muted" data-testid="encounter-detail-summary">
                {s.games} recorded game{s.games === 1 ? "" : "s"} with team members
                {s.ally.games ? <span className="text-blue"> · alongside {s.ally.games}</span> : null}
                {s.opponent.games ? <span className="text-red"> · against {s.opponent.games}</span> : null}
              </p>
            ) : null}
          </div>
          {result?.status === "ok" && result.opgg ? (
            <a href={result.opgg} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong px-2.5 text-xs font-medium text-fg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-accent" data-testid="encounter-opgg">
              OP.GG <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      }
    >
      {!result ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
          ))}
        </div>
      ) : result.status !== "ok" ? (
        <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="encounter-detail-message">
          {result.message}
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2" data-testid="encounter-detail-records">
            {(
              [
                ["Together", result.summary.ally, "text-blue"],
                ["Against", result.summary.opponent, "text-red"],
              ] as const
            ).map(([label, wl, tone]) => (
              <div key={label} className="rounded-lg border border-border bg-bg/40 px-3 py-2">
                <dt className={cn("text-[11px] font-medium uppercase tracking-[0.08em]", tone)}>{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{wl.games ? `${times(wl.games)}` : "—"}</dd>
                <dd className="text-xs tabular-nums text-fg-muted">{wl.games ? recordText(wl) : "No recorded games"}</dd>
              </div>
            ))}
          </dl>
          <section aria-labelledby="encounter-members">
            <h3 id="encounter-members" className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              By team member
            </h3>
            <ul className="divide-y divide-border/60 rounded-lg border border-border" data-testid="encounter-detail-members">
              {result.summary.members.map((m) => {
                const member = members[m.playerId];
                return (
                  <li key={m.playerId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {member ? <CardAvatar look={member.look} name={member.name} src={member.avatarUrl} size="xs" /> : null}
                      <span className="truncate font-medium">{member?.name ?? "Team member"}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 text-xs tabular-nums text-fg-muted">
                      {m.ally.games ? <span className="text-blue">With {m.ally.games} · {m.ally.wins}W {m.ally.losses}L</span> : null}
                      {m.opponent.games ? <span className="text-red">Against {m.opponent.games} · {m.opponent.wins}W {m.opponent.losses}L</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section aria-labelledby="encounter-games">
            <h3 id="encounter-games" className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              Recorded games
            </h3>
            <ul className="space-y-1.5" data-testid="encounter-games">
              {result.games.map((g) => {
                const member = members[g.playerId];
                return (
                  <li key={`${g.playerId}-${g.matchId}`}>
                    <button type="button" onClick={() => setMatch({ playerId: g.playerId, matchId: g.matchId })} className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-bg/30 px-3 py-2 text-left text-xs transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-accent", g.relation === "ally" ? "border-l-2 border-l-blue/70" : "border-l-2 border-l-red/70")} data-testid="encounter-game" data-relation={g.relation}>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="tabular-nums text-fg-muted">{formatDate(new Date(g.playedAt))}</span>
                        <span className="text-fg-subtle">{g.queue}</span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          {member ? <CardAvatar look={member.look} name={member.name} src={member.avatarUrl} size="xs" /> : null}
                          <span className="truncate font-medium text-fg">{member?.name ?? "Team member"}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <ChampionPortrait champion={champ(g.memberChampion)} size="xs" className="h-6 w-6 text-[8px]" />
                          <span className={g.relation === "ally" ? "text-blue" : "text-red"}>{g.relation === "ally" ? "with" : "vs"}</span>
                          <ChampionPortrait champion={champ(g.otherChampion)} size="xs" className="h-6 w-6 text-[8px]" />
                        </span>
                      </span>
                      <span className={cn("font-semibold", g.win === true ? "text-blue" : g.win === false ? "text-red" : "text-fg-muted")}>{g.win === true ? "Won" : g.win === false ? "Lost" : "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {result.more ? <p className="mt-1.5 text-xs text-fg-subtle">and {result.more} earlier games</p> : null}
          </section>
          <p className="text-[11px] leading-snug text-fg-subtle" data-testid="encounter-detail-note">
            Only games UNIIVERSE recorded for team members, in the view&apos;s season and game mode. They describe games played together or against each other, not parties or anything else about the player, and a missing game is not proof they never met.
          </p>
        </div>
      )}
    </DetailModal>
  );
}
