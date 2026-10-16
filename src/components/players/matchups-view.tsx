"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Info } from "lucide-react";
import { SEASON_MODES, seasonModeInfo, type SeasonMode } from "@/domain/season-stats";
import { seasonLabel } from "@/domain/season";
import { CURVE_MINUTES, MIN_CURVE_GAMES, MIN_PATTERN_GAMES } from "@/domain/matchups";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateSampleNote, winRateTone } from "@/domain/stats/win-rate";
import type { MatchupDetail, MatchupGameView, MatchupsData } from "@/server/players/matchups";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { FilterBar, FilterField } from "@/components/ui/filter-bar";
import { selectClass } from "@/components/ui/input";
import { InfoTip } from "@/components/ui/info-tip";
import { MatchDetailDrawer } from "@/components/match-history/match-detail";
import { percent, timeAgo } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  Profile → Matchups. Choose one of your champions, then an opponent you actually faced in lane.
  The record and win rate always show their sample; the lane figures come from match timelines
  (read at exact minutes, each with the number of games behind it); every game behind the numbers
  is listed and opens in the same details panel as Match History. What it shows is what happened in
  these games: no grades, no advice.
*/

const signed = (n: number | null, digits = 0) => (n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("en", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`);
const tone = (n: number | null) => (n === null || Math.abs(n) < 0.5 ? "text-fg-muted" : n > 0 ? "text-good" : "text-bad");
const fmtDuration = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "—");

export function MatchupsView({ data, basePath, playerId, championsById }: { data: MatchupsData; basePath: string; playerId: string; championsById: Record<string, PortraitChampion> }) {
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  const href = (change: Partial<{ account: string | null; season: number | "all"; mode: SeasonMode; champion: string | null; vs: string | null }>) => {
    const next = { account: data.account === data.accounts.find((a) => a.main)?.id ? null : data.account, season: data.season, mode: data.mode, champion: data.champion, vs: data.vs, ...change };
    const q = new URLSearchParams();
    if (next.account) q.set("account", next.account);
    if (next.season !== data.currentSeason) q.set("season", String(next.season));
    if (next.mode !== "all") q.set("mode", next.mode);
    if (next.champion) q.set("champion", next.champion);
    if (next.vs) q.set("vs", next.vs);
    return `${basePath}${q.size ? `?${q.toString()}` : ""}`;
  };
  const accountName = data.account === "all" ? "All linked accounts" : data.accounts.find((a) => a.id === data.account)?.riotId ?? "";
  return (
    <section className="space-y-4" aria-labelledby="matchups-title" data-testid="matchups">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h2 id="matchups-title" className="text-lg font-semibold text-fg">
            Matchups
          </h2>
          <p className="flex flex-wrap items-center gap-x-1 text-sm text-fg-muted" data-testid="matchups-scope">
            <span>
              Lane opponents in {data.gamesWithOpponent.toLocaleString("en")} of {data.games.toLocaleString("en")} games · {seasonModeInfo(data.mode).label} · {data.season === "all" ? "every stored season" : seasonLabel(data.season)}
            </span>
            <InfoTip label="Who counts as the lane opponent" text="The enemy Riot placed in your position in that game. Games where the match details do not make that clear are left out." />
          </p>
        </div>
        {data.accounts.length ? <MatchupFilters data={data} href={href} /> : null}
      </div>

      {!data.accounts.length ? (
        <Empty>No Riot account is linked to this profile yet.</Empty>
      ) : !data.champions.length ? (
        <Empty>{data.games ? "None of the stored games in this scope names a lane opponent yet." : "No stored games in this scope yet: they appear after the account sync."}</Empty>
      ) : (
        // Two steps, left to right: your champion (one list), then its opponents as a row right above
        // the matchup they open, so the chosen matchup stays the focus of the page.
        <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="min-w-0" aria-label="Choose your champion">
            <Chooser
              label="Your champion"
              testId="matchups-champions"
              items={data.champions.map((c) => ({ id: c.championId, games: c.games, wins: c.wins, href: href({ champion: c.championId, vs: null }) }))}
              current={data.champion}
              champ={champ}
            />
          </aside>
          <div className="min-w-0 space-y-3">
            <Opponents
              label={`Opponents faced on ${champ(data.champion!).name}`}
              items={data.opponents.map((o) => ({ id: o.championId, games: o.games, wins: o.wins, href: href({ vs: o.championId }) }))}
              current={data.vs}
              champ={champ}
            />
            {data.detail && data.champion && data.vs ? <Detail detail={data.detail} me={champ(data.champion)} them={champ(data.vs)} account={accountName} multiAccount={data.account === "all"} playerId={playerId} championsById={championsById} /> : null}
          </div>
        </div>
      )}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="matchups-empty">
      {children}
    </p>
  );
}

/** Account and game mode: the shared filter bar. The Main account is the default. */
function MatchupFilters({ data, href }: { data: MatchupsData; href: (c: { account?: string | null; season?: number | "all"; mode?: SeasonMode }) => string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const mainId = data.accounts.find((a) => a.main)?.id ?? data.accounts[0]?.id ?? null;
  const go = (url: string) => start(() => router.replace(url, { scroll: false }));
  const account = data.account === "all" ? "all" : data.account ?? "";
  const narrowed = (data.account !== mainId ? 1 : 0) + (data.season !== data.currentSeason ? 1 : 0) + (data.mode !== "all" ? 1 : 0);
  const summary = [data.accounts.length > 1 ? (data.account === "all" ? "All linked accounts" : data.accounts.find((a) => a.id === data.account)?.riotId) : null, data.season === "all" ? "All seasons" : seasonLabel(data.season), seasonModeInfo(data.mode).label].filter(Boolean).join(" · ");
  return (
    <FilterBar className="xl:shrink-0" testId="matchups-filters" summary={summary} activeCount={narrowed} onReset={() => go(href({ account: null, season: data.currentSeason, mode: "all" }))} align="end" pending={pending}>
      {data.accounts.length > 1 ? (
        <FilterField label="Riot account" htmlFor="matchups-account">
          <select id="matchups-account" className={selectClass("md:w-auto md:max-w-[16rem]")} value={account} onChange={(e) => go(href({ account: e.target.value === mainId ? null : e.target.value }))} data-testid="matchups-account">
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.riotId}
                {a.main ? " (Main)" : ""}
              </option>
            ))}
            <option value="all">All linked accounts</option>
          </select>
        </FilterField>
      ) : null}
      <FilterField label="Season" htmlFor="matchups-season">
        <select id="matchups-season" className={selectClass("md:w-44")} value={String(data.season)} onChange={(e) => go(href({ season: e.target.value === "all" ? "all" : Number(e.target.value) }))} data-testid="matchups-season">
          {data.seasons.map((s) => (
            <option key={s} value={s}>
              {seasonLabel(s)}
              {s === data.currentSeason ? " (current)" : ""}
            </option>
          ))}
          <option value="all">All seasons</option>
        </select>
      </FilterField>
      <FilterField label="Game mode" htmlFor="matchups-mode">
        <select id="matchups-mode" className={selectClass("md:w-48")} value={data.mode} onChange={(e) => go(href({ mode: e.target.value as SeasonMode }))} data-testid="matchups-mode">
          {SEASON_MODES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </FilterField>
    </FilterBar>
  );
}

/**
 * A list of champions with their record, each a link. Wide screens: a list; phones and tablets: one
 * dropdown, so the matchup itself comes first.
 */
function Chooser({ label, items, current, champ, testId }: { label: string; items: Array<{ id: string; games: number; wins: number; href: string }>; current: string | null; champ: (id: string) => PortraitChampion; testId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const id = React.useId();
  return (
    <div className="min-w-0" data-testid={testId}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-fg-muted lg:sr-only">
        {label}
      </label>
      <select id={id} className={selectClass("lg:hidden")} value={current ?? ""} onChange={(e) => router.push(items.find((i) => i.id === e.target.value)?.href ?? pathname, { scroll: false })} data-testid={`${testId}-select`}>
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {champ(i.id).name} · {i.games} game{i.games === 1 ? "" : "s"} · {i.wins}W {i.games - i.wins}L
          </option>
        ))}
      </select>
      <nav aria-label={label} className="hidden overflow-hidden rounded-card border border-border bg-surface lg:block">
        <h3 className="border-b border-border px-3 py-2 text-xs font-medium text-fg-subtle">{label}</h3>
        <ul className="max-h-[min(36rem,calc(100dvh-16rem))] divide-y divide-border/60 overflow-y-auto">
          {items.map((i) => {
            const on = i.id === current;
            return (
              <li key={i.id}>
                <Link href={i.href} scroll={false} aria-current={on ? "true" : undefined} className={cn("flex min-h-11 items-center gap-2.5 px-3 py-1.5 text-sm transition-colors", on ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")} data-testid={`${testId}-item`} data-champion={i.id}>
                  <ChampionPortrait champion={champ(i.id)} size="xs" />
                  <span className="min-w-0 flex-1 truncate font-medium">{champ(i.id).name}</span>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    <span className="text-fg">{i.games}</span> <span className="text-fg-subtle">· {i.wins}W {i.games - i.wins}L</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** The opponents faced on the chosen champion, as one row of chips above the matchup they open; the
 *  most played first, the rest in a menu so the row never grows into a second list. */
function Opponents({ label, items, current, champ }: { label: string; items: Array<{ id: string; games: number; wins: number; href: string }>; current: string | null; champ: (id: string) => PortraitChampion }) {
  const router = useRouter();
  const id = React.useId();
  const SHOWN = 10;
  const shown = items.slice(0, SHOWN);
  const rest = items.slice(SHOWN);
  const currentInRest = rest.some((i) => i.id === current);
  return (
    <nav aria-label={label} className="rounded-card border border-border bg-surface p-3" data-testid="matchups-opponents">
      <h3 className="mb-2 text-xs font-medium text-fg-subtle">{label}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((i) => {
          const on = i.id === current;
          return (
            <li key={i.id}>
              <Link href={i.href} scroll={false} aria-current={on ? "true" : undefined} className={cn("inline-flex min-h-10 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors pointer-coarse:min-h-11", on ? "border-accent/60 bg-accent/10 text-fg" : "border-border text-fg-muted hover:border-border-strong hover:text-fg")} data-testid="matchups-opponents-item" data-champion={i.id}>
                <ChampionPortrait champion={champ(i.id)} size="xs" className="rounded-full" />
                <span className="font-medium">{champ(i.id).name}</span>
                <span className="text-xs tabular-nums text-fg-subtle">
                  {i.games} · {i.wins}W {i.games - i.wins}L
                </span>
              </Link>
            </li>
          );
        })}
        {rest.length ? (
          <li>
            <label htmlFor={id} className="sr-only">
              More opponents
            </label>
            <select id={id} className={selectClass(cn("min-h-10 rounded-full", currentInRest && "border-accent/60 text-fg"))} value={currentInRest ? current! : ""} onChange={(e) => { const to = rest.find((i) => i.id === e.target.value); if (to) router.push(to.href, { scroll: false }); }} data-testid="matchups-opponents-select">
              <option value="" disabled>
                {rest.length} more opponent{rest.length === 1 ? "" : "s"}
              </option>
              {rest.map((i) => (
                <option key={i.id} value={i.id}>
                  {champ(i.id).name} · {i.games} game{i.games === 1 ? "" : "s"} · {i.wins}W {i.games - i.wins}L
                </option>
              ))}
            </select>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

function Detail({ detail: d, me, them, account, multiAccount, playerId, championsById }: { detail: MatchupDetail; me: PortraitChampion; them: PortraitChampion; account: string; multiAccount: boolean; playerId: string; championsById: Record<string, PortraitChampion> }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const winRate = d.games ? d.wins / d.games : null;
  const small = winRateSampleNote(winRate, d.games, WIN_RATE_MIN_GAMES.champion) !== null;
  const t = d.timelines;
  // A timeline status every game shares is said once (above); rows only name the exceptions.
  const statuses = new Set(d.matches.map((g) => g.timeline));
  const stated = statuses.size === 1 ? [...statuses][0]! : null;
  return (
    <div className="min-w-0 space-y-3" data-testid="matchup-detail">
      <div className="rounded-card border border-border bg-surface p-4">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-fg" data-testid="matchup-title">
          <ChampionPortrait champion={me} size="sm" /> {me.name} <span className="text-sm font-normal text-fg-subtle">vs</span> <ChampionPortrait champion={them} size="sm" /> {them.name}
        </h3>
        <p className="mt-0.5 text-xs text-fg-subtle">{account}</p>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          <Tile label="Games" value={String(d.games)} testId="matchup-games" />
          <Tile label="Record" value={`${d.wins}W ${d.games - d.wins}L`} testId="matchup-record" />
          <Tile label="Win rate" value={winRate === null ? "—" : percent(winRate, 0)} className={WIN_RATE_TONE_CLASS[winRateTone(winRate, d.games, WIN_RATE_MIN_GAMES.champion)]} sub={small ? `Small sample: ${d.games} game${d.games === 1 ? "" : "s"}` : undefined} testId="matchup-winrate" />
        </dl>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" data-testid="matchup-sources">
          {d.byQueue.map((q) => (
            <span key={q.label}>
              {q.label} <span className="tabular-nums text-fg">{q.games}</span> ({q.wins}W {q.games - q.wins}L)
            </span>
          ))}
          {multiAccount
            ? d.byAccount.map((a) => (
                <span key={a.label}>
                  {a.label} <span className="tabular-nums text-fg">{a.games}</span> ({a.wins}W {a.games - a.wins}L)
                </span>
              ))
            : null}
        </div>
      </div>

      <section className="rounded-card border border-border bg-surface p-4" aria-labelledby="lane-title" data-testid="matchup-lane">
        <h3 id="lane-title" className="flex items-center gap-1.5 text-sm font-semibold text-fg">
          The lane, from match timelines
          <InfoTip label="How the lane figures are made" text="Riot's match timeline records each player's gold, experience and CS about once a minute. Each figure here is yours minus your lane opponent's at that exact minute, read between the two recorded moments around it. A game that had ended before a minute is not counted there, so every column says how many games it covers. Remakes are left out." />
        </h3>
        <p className="mt-0.5 text-xs text-fg-muted" data-testid="matchup-timelines">
          {t.frames ? `Timelines for ${t.frames} of ${d.games} game${d.games === 1 ? "" : "s"}` : `No timeline stored yet for these ${d.games} game${d.games === 1 ? "" : "s"}`}
          {t.pending ? ` · ${t.pending} still to be collected, a few at a time, newest first` : ""}
          {t.unavailable ? ` · ${t.unavailable} no longer provided by Riot` : ""}
          {t.noDetails ? ` · ${t.noDetails} without a clear lane opponent in the match details` : ""}
        </p>
        {t.frames ? (
          <>
            <LaneTable detail={d} />
            <GoldCurve detail={d} />
            <div className="mt-3 space-y-1 text-sm text-fg" data-testid="matchup-notes">
              {d.notes.length ? d.notes.map((n) => <p key={n}>{n}</p>) : <p className="text-fg-muted">Fewer than {MIN_PATTERN_GAMES} games with a timeline: too few to describe a pattern.</p>}
              <p className="flex items-start gap-1.5 text-xs text-fg-subtle">
                <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> What happened in these games, not why: the draft, the jungle and the rest of the map all play a part.
              </p>
            </div>
          </>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-card border border-border bg-surface" aria-labelledby="games-title" data-testid="matchup-games-list">
        <h3 id="games-title" className="border-b border-border px-4 py-2.5 text-sm font-semibold text-fg">
          The games <span className="font-normal text-fg-subtle">· newest first</span>
        </h3>
        <ol className="divide-y divide-border/60">
          {d.matches.map((g) => (
            <GameRow key={g.matchId} g={g} showAccount={multiAccount} onOpen={() => setOpen(g.matchId)} stated={stated} />
          ))}
        </ol>
      </section>
      {open ? <MatchDetailDrawer playerId={playerId} matchId={open} championsById={championsById} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Tile({ label, value, sub, className, testId }: { label: string; value: string; sub?: string; className?: string; testId?: string }) {
  return (
    <div className="min-w-0 rounded-panel border border-border/70 bg-bg-elevated/60 px-3 py-2" data-testid={testId}>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={cn("text-xl font-semibold tabular-nums text-fg", className)}>{value}</dd>
      {sub ? <dd className="text-[11px] leading-tight text-fg-subtle">{sub}</dd> : null}
    </div>
  );
}

/** Gold, experience and CS differences at the checkpoints, each column with its number of games. */
function LaneTable({ detail: d }: { detail: MatchupDetail }) {
  const rows: Array<{ label: string; value: (c: MatchupDetail["checkpoints"][number]) => React.ReactNode }> = [
    { label: "Gold", value: (c) => <span className={tone(c.goldMean)}>{signed(c.goldMean)}</span> },
    { label: "Experience", value: (c) => <span className={tone(c.xpMean)}>{signed(c.xpMean)}</span> },
    { label: "CS", value: (c) => <span className={tone(c.csMean)}>{signed(c.csMean, 1)}</span> },
    { label: "Ahead in gold", value: (c) => (c.games ? `${c.aheadInGold} of ${c.games}` : "—") },
  ];
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs sm:text-sm" data-testid="matchup-checkpoints">
        <caption className="sr-only">Average difference with your lane opponent at each minute (yours minus theirs)</caption>
        <thead>
          <tr className="text-xs text-fg-subtle">
            <th scope="col" className="py-1 pr-2 text-left font-medium">
              <span className="sm:hidden">Difference</span>
              <span className="max-sm:hidden">Average difference</span>
            </th>
            {d.checkpoints.map((c) => (
              <th key={c.minute} scope="col" className="px-1 py-1 text-right font-medium tabular-nums sm:px-2">
                {c.minute}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <th scope="row" className="py-1.5 pr-2 text-left font-normal text-fg-muted">
                {r.label}
              </th>
              {d.checkpoints.map((c) => (
                <td key={c.minute} className="whitespace-nowrap px-1 py-1.5 text-right font-medium sm:px-2">
                  {c.games ? r.value(c) : <span className="text-fg-subtle">—</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border/60 text-xs text-fg-subtle">
            <th scope="row" className="py-1 pr-2 text-left font-normal">
              Games
            </th>
            {d.checkpoints.map((c) => (
              <td key={c.minute} className="px-1 py-1 text-right sm:px-2" data-testid={`checkpoint-games-${c.minute}`}>
                {c.games}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Gold difference over the first minutes: each game as a faint line, and the average where at
 * least MIN_CURVE_GAMES games reached that minute (with the count under the axis).
 */
function GoldCurve({ detail: d }: { detail: MatchupDetail }) {
  return (
    <figure className="mt-4" data-testid="matchup-curve">
      <figcaption className="mb-1 text-xs text-fg-muted">Gold difference by minute (yours minus your opponent&apos;s). Faint lines are single games; the bright line is the average where {MIN_CURVE_GAMES}+ games reached that minute.</figcaption>
      {/* Drawn at the size it is shown, so the axis labels stay readable on a phone. */}
      <CurveSvg detail={d} width={360} height={220} className="sm:hidden" />
      <CurveSvg detail={d} width={600} height={200} className="max-sm:hidden" />
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-fg-subtle" data-testid="matchup-curve-samples">
        Games reaching: {[5, 10, 15, 20, 25, 30].map((m) => `${m}:00 ${d.curve.find((c) => c.minute === m)?.games ?? 0}`).join(" · ")}
        <span>
          <span className="text-blue">—</span> win <span className="text-red">—</span> loss
        </span>
      </p>
    </figure>
  );
}

function CurveSvg({ detail: d, width: W, height: H, className }: { detail: MatchupDetail; width: number; height: number; className?: string }) {
  const pad = { l: 44, r: 22, t: 10, b: 22 };
  const games = d.matches.filter((m) => m.curve.length);
  const values = games.flatMap((g) => g.curve.filter((v): v is number => v !== null));
  const max = Math.max(1000, Math.ceil(Math.max(0, ...values.map((v) => Math.abs(v))) / 500) * 500);
  const x = (minute: number) => pad.l + ((W - pad.l - pad.r) * minute) / CURVE_MINUTES;
  const y = (v: number) => pad.t + ((H - pad.t - pad.b) * (max - v)) / (2 * max);
  const line = (pts: Array<[number, number]>) => pts.map(([m, v], i) => `${i ? "L" : "M"}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const segments = (curve: Array<number | null>) => {
    const out: Array<Array<[number, number]>> = [];
    let cur: Array<[number, number]> = [];
    curve.forEach((v, i) => {
      if (v === null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push([i + 1, v]);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  const meanCurve = d.curve.map((m) => (m.games >= MIN_CURVE_GAMES ? m.goldMean : null));
  const ticks = [-max, -max / 2, 0, max / 2, max];
  const xLabels = W < 500 ? [0, 10, 20, 30] : [0, 5, 10, 15, 20, 25, 30];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn("h-auto w-full", className)} role="img" aria-label={`Gold difference by minute in ${games.length} games`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? "stroke-border-strong" : "stroke-border/60"} strokeDasharray={v === 0 ? undefined : "3 4"} />
            <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-fg-subtle text-[10px] tabular-nums">
              {signed(v)}
            </text>
          </g>
        ))}
        {xLabels.map((m) => (
          <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-fg-subtle text-[10px] tabular-nums">
            {m}:00
          </text>
        ))}
        {games.map((g) => segments(g.curve).map((seg, i) => <path key={`${g.matchId}-${i}`} d={line(seg)} fill="none" className={g.win ? "stroke-blue/35" : "stroke-red/35"} strokeWidth={1.2} />))}
        {segments(meanCurve).map((seg, i) => (
          <path key={`mean-${i}`} d={line(seg)} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" data-testid="matchup-curve-mean" />
        ))}
    </svg>
  );
}

const TIMELINE_LABEL: Record<MatchupGameView["timeline"], string> = { frames: "", pending: "Timeline not collected yet", unavailable: "Timeline no longer provided by Riot", "no-details": "Lane opponent unclear in the match details" };

function GameRow({ g, showAccount, onOpen, stated }: { g: MatchupGameView; showAccount: boolean; onOpen: () => void; stated: MatchupGameView["timeline"] | null }) {
  const at = (m: number) => g.at.find((a) => a.minute === m);
  return (
    <li>
      <button type="button" onClick={onOpen} className="grid w-full grid-cols-[4px_minmax(0,1fr)_auto] items-center gap-x-3 px-0 py-0 text-left hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-accent" data-testid="matchup-game" data-match={g.matchId} aria-label={`${g.win ? "Win" : "Loss"}, ${g.queue}, ${timeAgo(new Date(g.playedAt))}. Open the match details.`}>
        <span className={cn("h-full min-h-14 self-stretch", g.win ? "bg-blue" : "bg-red")} aria-hidden />
        <span className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)]">
          <span className="min-w-0 text-xs leading-tight">
            <span className={cn("block font-semibold uppercase", g.win ? "text-blue" : "text-red")}>{g.win ? "Win" : "Loss"}</span>
            <span className="block truncate text-fg-muted">{g.queue}</span>
            <span className="block text-fg-subtle">
              {timeAgo(new Date(g.playedAt))} · {fmtDuration(g.durationSeconds)}
            </span>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-fg-muted">
            <span className="tabular-nums">
              <span className="font-semibold text-fg">{g.kills === null ? "—" : `${g.kills} / ${g.deaths} / ${g.assists}`}</span> KDA
            </span>
            <span className="tabular-nums">
              <span className="font-semibold text-fg">{g.cs ?? "—"}</span> CS
            </span>
            {g.timeline === "frames" ? (
              [10, 15].map((m) => (
                <span key={m} className="tabular-nums">
                  Gold at {m}:00 <span className={cn("font-semibold", tone(at(m)?.gold ?? null))}>{signed(at(m)?.gold ?? null)}</span>
                </span>
              ))
            ) : g.timeline === stated ? null : (
              <span className="text-fg-subtle" data-testid="matchup-game-timeline">{TIMELINE_LABEL[g.timeline]}</span>
            )}
            {showAccount ? <span className="truncate text-fg-subtle">{g.account}</span> : null}
          </span>
        </span>
        <ChevronRight className="mr-3 h-4 w-4 text-fg-subtle" aria-hidden />
      </button>
    </li>
  );
}
