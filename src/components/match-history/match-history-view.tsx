"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { MULTIKILL_NAMES } from "@/domain/multikills";
import { QUEUE_GROUP_WORDS, figureText, queueGroup, type FigureKey } from "@/domain/match-analysis";
import { narrowsGames, refineParams, type SessionSummary } from "@/domain/history-refine";
import type { MatchHistoryPage, MatchRow } from "@/server/players/match-history";
import type { Composition } from "@/server/matches/compositions";
import type { ParticipantRank } from "@/domain/known-rank";
import type { PortraitChampion } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { timeAgo, formatCount, formatDayMonth, formatNumber, formatTimeOfDay } from "@/lib/format";
import { cn } from "@/lib/cn";
import { MatchDetailModal } from "./match-detail";
import { MatchDetailCacheContext, createMatchDetailCache, type MatchDetailCache } from "./match-detail-cache";
import { EncounterLinkContext, type EncounterLink } from "./match-breakdown";
import { MatchExpansion, revealIfAbove, revealOpened } from "./inline-match";
import { HistorySummaryStrip } from "./history-summary";
import { ItemRow } from "./icon-img";
import { MultikillTag } from "./multikill-tag";
import { ChampionLoadout, MatchRail, MatchResult, matchCardClass, matchTone } from "./match-card";
import { TeamComposition } from "./team-composition";
import { ModeElsewhere, OverviewFilters } from "@/components/players/overview-filters";
import { HistoryRefineFields, historyRefinements } from "./history-refine-fields";
import { EncounterWindow, MatchViewSwitch } from "./encounters-view";
import type { DataStatus } from "@/domain/data-status";
import { DataStatusNote, RefreshButton, type DataRefreshTarget } from "@/components/ui/data-status";
import { SectionHeader } from "@/components/ui/section-header";
import { useNow } from "@/components/ui/relative-time";

/** A card's rendered height in rem (about 6.4rem with both teams' five rows) plus the gap between cards; pixels follow the root size,
    so the page size is chosen for whole cards to fill the screen. */
const ROW_REM = 6.4 + 0.375;
const PHONE_PER = 10;

export const fmtDuration = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
export const fmtNum = (v: number | null, digits = 1) => (v === null ? "—" : v.toFixed(digits));
export const fmtInt = (v: number | null) => (v === null ? "—" : formatCount(v));

/** Ranks the match window checked (by place in the stored record) over the opponents' stored ones. */
function withChecked(teams: Composition, checked: ReadonlyMap<number, ParticipantRank>): Composition {
  const side = (slots: Composition["blue"]) => slots.map((s) => (s.rank && checked.has(s.slot) ? { ...s, rank: checked.get(s.slot)! } : s));
  return { ...teams, blue: side(teams.blue), red: side(teams.red) };
}

/** A figure's short name on a card's "best" chip. */
const STANDOUT_SHORT: Record<FigureKey, string> = { kda: "KDA", csPerMin: "CS/min", damagePerMin: "damage/min", visionPerMin: "vision/min" };

/** The team members in the game, beside the player and against them (by PUUID: domain/compositions, never guessed). */
function membersIn(teams: Composition | null) {
  if (!teams?.side) return { with: [], against: [] };
  const other = teams.side === "blue" ? "red" : "blue";
  return { with: teams[teams.side].filter((s) => s.member && !s.you).map((s) => s.member!), against: teams[other].filter((s) => s.member).map((s) => s.member!) };
}

/**
 * Memoised: opening a match re-renders only the cards it opens and closes, not the whole page. The
 * breakdown opens under its card (MatchBreakdown), one game at a time.
 */
const MatchCard = React.memo(function MatchCard({ row, playerId, champion, champ, onToggle, onPrefetch, expanded, checked }: { row: MatchRow; playerId: string; champion: PortraitChampion; champ: (id: string | null) => PortraitChampion; onToggle: (matchId: string) => void; onPrefetch: (matchId: string) => void; expanded: boolean; /** Ranks its breakdown checked with Riot, shown without reloading the page. */ checked?: ReadonlyMap<number, ParticipantRank> }) {
  const kp = row.killParticipation === null ? "—" : `${Math.round(row.killParticipation * 100)}%`;
  const tone = matchTone(row.win);
  const account = row.riotId ? row.riotId.split("#")[0] : null;
  const when = timeAgo(new Date(row.playedAt), useNow());
  const kda = row.kills === null ? "—" : `${row.kills} / ${row.deaths} / ${row.assists}`;
  const ratio = row.kda === null ? "details not collected" : row.perfect ? "Perfect KDA" : `${row.kda.toFixed(2)} KDA`;
  const multikill = row.multikill ? MULTIKILL_NAMES[row.multikill] : null;
  const build = row.record === "stored" ? <ItemRow items={row.items} size={22} stacked className="grid-cols-7 @min-[56rem]/mh:grid-cols-4" trinketClassName="order-last ml-0.5 @min-[56rem]/mh:order-none @min-[56rem]/mh:ml-0" /> : <span className="text-xs text-fg-subtle">{row.record === "missing" ? "Items being collected" : "Items not provided by Riot"}</span>;
  const teamsId = `teams-${row.matchId}`;
  const regionId = `match-${row.matchId}-details`;
  const teams = React.useMemo(() => (row.teams && checked ? withChecked(row.teams, checked) : row.teams), [row.teams, checked]);
  const members = membersIn(row.teams);
  const roleName = row.role ? ROLE_LABELS[row.role as Role] : null;
  const standout = row.standout;
  const standoutTitle = standout ? `Your highest ${standout.label} in your last ${standout.games} ${QUEUE_GROUP_WORDS[queueGroup(row.queueId)]} games${roleName ? ` as ${roleName}` : ""}: ${figureText(standout.key, standout.value)} (the highest before: ${figureText(standout.key, standout.top)})` : undefined;
  const open = React.useRef<HTMLButtonElement>(null);
  return (
    <li id={`match-${row.matchId}`} className="scroll-mt-16 lg:scroll-mt-3" data-testid="match-item" data-expanded={expanded || undefined}>
      {/* One game per card, read the way a player scans a match list: the result column (queue,
          when, Victory / Defeat, length), the champion (its level, spells and runes), the KDA
          with the game's largest multikill and, rarely, a figure the player never beat in their
          recent comparable games, the figures (kill participation, CS and damage, each with its
          total or share), the build and both teams (who played what, the player in bold, team
          members in the accent colour, everyone's stored rank). The wide layout follows the
          list's own width (a container query), not the window's: below 50rem it stacks in rows,
          below 56rem the build is left to the breakdown. */}
      {/* The whole card opens and closes the match's breakdown under it. The player links in the
          teams cannot sit inside a button, so the card is a box: a click anywhere on it (but a
          link) toggles it, and one button behind the content is the card for the keyboard and
          screen readers (one stop per card, Enter or Space toggles it, its outline marks the card). */}
      <div
        className={cn("group cursor-pointer", matchCardClass(row.win, { interactive: true }), expanded && "rounded-b-none border-b-border/40")}
        onClick={(e) => {
          if ((e.target as Element).closest("a")) return;
          open.current!.focus({ preventScroll: true });
          onToggle(row.matchId);
        }}
        // A mouse press starts loading the match before the click lands (not touch: a finger that
        // goes down on a card is as often starting a scroll).
        onPointerDown={(e) => {
          if (!expanded && e.pointerType === "mouse" && e.button === 0 && !(e.target as Element).closest("a")) onPrefetch(row.matchId);
        }}
        data-testid="match-card"
      >
        <button
          ref={open}
          type="button"
          className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          aria-label={`${tone.word} on ${champion.name}, ${row.queue}, ${when}${multikill ? `, ${multikill.toLowerCase()}` : ""}. ${expanded ? "Hide" : "Show"} the match details.`}
          aria-describedby={row.teams ? teamsId : undefined}
          aria-expanded={expanded}
          aria-controls={expanded ? regionId : undefined}
          data-testid="match-row"
          data-match={row.matchId}
          data-result={row.win ? "W" : "L"}
        />
        <MatchRail win={row.win} />
        <span className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 @min-[50rem]/mh:grid-cols-[6.25rem_auto_minmax(6rem,0.8fr)_minmax(5.25rem,0.55fr)_minmax(5.5rem,0.55fr)_minmax(12rem,2fr)_auto] @min-[50rem]/mh:gap-x-4 @min-[50rem]/mh:py-2 @min-[56rem]/mh:grid-cols-[6.25rem_auto_minmax(6rem,0.8fr)_minmax(5.25rem,0.55fr)_minmax(5.5rem,0.55fr)_auto_minmax(12rem,2fr)_auto] @min-[72rem]/mh:gap-x-5">
          <MatchResult win={row.win} queue={row.queue} when={when} duration={fmtDuration(row.durationS)} className="hidden @min-[50rem]/mh:flex" />
          <ChampionLoadout champion={champion} spells={row.spells} keystone={row.keystone} secondary={row.secondary} level={row.champLevel} size="md" icon={22} portraitClassName="@min-[50rem]/mh:h-14 @min-[50rem]/mh:w-14" iconsClassName="@max-[50rem]/mh:hidden" />
          {/* The champion, the role, the account it was played on and the team members in the game */}
          <span className="min-w-0 leading-snug">
            <span className={cn("block truncate text-xs font-bold @min-[50rem]/mh:hidden", tone.text)} data-testid="match-card-meta">
              {tone.word}{" "}
              {/* "3h ago" is measured on the server first, then by the browser's own clock (useNow). */}
              <span className="font-medium text-fg-subtle" suppressHydrationWarning>
                {/* A narrow card names the queue without "Ranked", so the time stays in view. */}
                · <span className="@max-[36rem]/mh:hidden">{row.queue}</span>
                <span className="hidden @max-[36rem]/mh:inline">{row.queue.replace(/^Ranked /, "")}</span> · {when}
              </span>
            </span>
            <span className="block truncate text-md font-semibold text-fg">{champion.name}</span>
            <span className="flex min-w-0 items-center gap-1 text-xs text-fg-muted">
              {row.role ? <RoleIcon role={row.role as Role} className="h-3.5 w-3.5 shrink-0" /> : null}
              <span className="truncate">{roleName ?? "Role not recorded"}</span>
              {account ? (
                <span className="ml-0.5 truncate rounded bg-surface-2 px-1.5 py-px text-2xs text-fg-subtle" title={`Played on ${row.riotId}`} data-testid="match-row-account">
                  {account}
                </span>
              ) : null}
            </span>
            {members.with.length || members.against.length ? (
              <span className="block truncate text-2xs" title={[members.with.length ? `With team members: ${members.with.map((m) => m.name).join(", ")}` : null, members.against.length ? `Against team members: ${members.against.map((m) => m.name).join(", ")}` : null].filter(Boolean).join(". ")} data-testid="match-members" data-with={members.with.length} data-against={members.against.length}>
                {members.with.length ? (
                  <span className="text-fg-subtle">
                    With{" "}
                    <span className="font-medium text-fg-muted">
                      <MemberNames names={members.with.map((m) => m.name)} />
                    </span>
                  </span>
                ) : null}
                {members.with.length && members.against.length ? <span className="text-fg-subtle"> · </span> : null}
                {members.against.length ? <span className="text-fg-muted">Against <MemberNames names={members.against.map((m) => m.name)} /></span> : null}
              </span>
            ) : null}
          </span>
          {/* KDA: the primary performance figure */}
          <span className="text-right leading-snug @min-[50rem]/mh:text-left">
            <span className="block whitespace-nowrap text-base font-semibold tabular-nums leading-snug text-fg @min-[50rem]/mh:text-lg">{kda}</span>
            <span className={cn("block text-xs tabular-nums", row.perfect ? "text-good" : (row.kda ?? 0) >= 3 ? "text-fg-muted" : "text-fg-subtle")}>{ratio}</span>
            {/* The game's largest multikill, quietly (see MultikillTag), and at most one "best" figure. */}
            {row.multikill || standout ? (
              <span className="mt-0.5 flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 @min-[50rem]/mh:justify-start">
                {row.multikill ? <MultikillTag size={row.multikill} /> : null}
                {standout ? (
                  <span className="whitespace-nowrap rounded border border-accent/40 px-1 text-2xs font-semibold leading-4 text-accent" title={standoutTitle} data-testid="match-standout" data-key={standout.key}>
                    Best {STANDOUT_SHORT[standout.key]} in {standout.games}
                    <span className="sr-only">: {standoutTitle}</span>
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
          {/* Kill participation, CS and damage: secondary, one per line on wide cards; each with its total or share */}
          <span className="col-span-3 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-fg-subtle @min-[36rem]/mh:col-span-2 @min-[50rem]/mh:col-span-1 @min-[50rem]/mh:flex-col @min-[50rem]/mh:gap-y-px">
            <Stat label="KP" value={kp} />
            <Stat label="CS/min" value={fmtNum(row.csPerMin)} extra={row.cs === null ? null : formatCount(row.cs)} title={row.cs === null ? undefined : `${formatCount(row.cs)} CS in the game`} testId="match-cs" />
            <Stat label="dmg/min" value={fmtInt(row.damagePerMin)} extra={row.damageShare === null ? null : `${Math.round(row.damageShare * 100)}%`} title={row.damage === null ? undefined : `${formatCount(row.damage)} damage to champions${row.damageShare === null ? "" : `, ${Math.round(row.damageShare * 100)}% of the team's`}`} testId="match-damage" />
          </span>
          {/* The build: its own row on phones, a compact block on wide cards (left to the
              breakdown when the list is too narrow for it beside the teams); on narrower cards it
              shares the figures' row when there is room, in one line */}
          <span className="col-span-3 flex items-center overflow-hidden @min-[36rem]/mh:col-span-1 @min-[36rem]/mh:justify-end @min-[50rem]/mh:hidden @min-[56rem]/mh:flex @min-[56rem]/mh:justify-start">{build}</span>
          {/* Both teams; without the full record, a quiet note instead of empty slots. */}
          <span className="col-span-3 min-w-0 @min-[50rem]/mh:col-span-1">
            {teams ? (
              <TeamComposition teams={teams} champion={champ} queueId={row.queueId} id={teamsId} />
            ) : (
              <span className="block text-xs text-fg-subtle" data-testid="match-teams-missing">
                {row.record === "missing" ? "Teams being collected" : "Teams not provided by Riot"}
              </span>
            )}
          </span>
          <ChevronRight className={cn("hidden h-4 w-4 text-fg-subtle transition-transform motion-reduce:transition-none @min-[50rem]/mh:block", expanded ? "rotate-90 text-fg" : "group-hover:translate-x-0.5 group-hover:text-fg")} aria-hidden />
        </span>
      </div>
      {expanded ? (
        <MatchExpansion
          id={regionId}
          label={`${tone.word} on ${champion.name}: match details`}
          playerId={playerId}
          matchId={row.matchId}
          champ={champ}
          onClose={() => {
            // The way back from the end of a long breakdown: closes the game and brings its card
            // into view (the list goes on from where it was), with the focus on it.
            onToggle(row.matchId);
            requestAnimationFrame(() => {
              revealIfAbove(document.getElementById(`match-${row.matchId}`));
              open.current?.focus({ preventScroll: true });
            });
          }}
        />
      ) : null}
    </li>
  );
});

/** Team members on a card: every name, or on a narrow card the first and how many more (all of them in the line's hover text and the scoreboard). */
function MemberNames({ names }: { names: string[] }) {
  return (
    <>
      <span className="@max-[36rem]/mh:hidden">{names.join(", ")}</span>
      <span className="hidden @max-[36rem]/mh:inline">
        {names[0]}
        {names.length > 1 ? ` +${names.length - 1}` : ""}
      </span>
    </>
  );
}

function Stat({ label, value, extra = null, title, testId }: { label: string; value: string; /** A quieter figure after it: the total or the share. */ extra?: string | null; title?: string; testId?: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1 leading-snug" title={title} data-testid={testId}>
      <span className="font-semibold tabular-nums text-fg">{value}</span>
      <span className="whitespace-nowrap">{label}</span>
      {extra ? <span className="whitespace-nowrap tabular-nums text-fg-subtle">({extra})</span> : null}
    </span>
  );
}

const NO_CHECKED: Record<string, ReadonlyMap<number, ParticipantRank>> = {};

/** A participant whose champion Riot did not record. */
const UNKNOWN_CHAMPION: PortraitChampion = { id: "unknown", name: "Unknown champion", portraitUrl: "" };

/** A champion missing from the static data, by id (kept per id so memoised cards stay equal). */
const noopSubscribe = () => () => {};

const fallbacks = new Map<string, PortraitChampion>();
function fallbackChampion(id: string): PortraitChampion {
  let c = fallbacks.get(id);
  if (!c) fallbacks.set(id, (c = { id, name: id, portraitUrl: "" }));
  return c;
}

/** Numbered pages with the ends and the neighbourhood of the current page; gaps shown as "…". */
export function pageList(page: number, pages: number): Array<number | "gap"> {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out: Array<number | "gap"> = [];
  let last = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - last > 1) out.push("gap");
    out.push(p);
    last = p;
  }
  return out;
}

/**
 * Match History: the player's stored Riot games, newest first, a screenful at a time (the page size
 * follows the window height, so the list never needs scrolling on a desktop). Above the games, a
 * line about the newest of them (HistorySummaryStrip); the filters are the profile's Overview's
 * (season and mode up front, role, champions and account behind Refine). A game opens under its
 * card (one at a time: the scoreboard, analysis, timeline and build), so the list stays where it
 * is and the next game is one click away. The open game is kept in the address (?match=, replaced,
 * not added to the history); a link to a game that is not on the page shown opens it in the
 * shared match window instead.
 */
export function MatchHistoryView({ data, championsById, basePath, playerId, playerName, status, refresh }: { data: MatchHistoryPage; championsById: Record<string, PortraitChampion>; basePath: string; playerId: string; /** The profile's name, in a player's Encounters window. */ playerName: string; /** The page's data status (domain/data-status). */ status?: DataStatus | null; /** Offered to the player and to those who manage Riot accounts, where Riot can be asked. */ refresh?: DataRefreshTarget | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Interactive once hydrated (data-ready, which browser tests wait for). A link followed before
  // then is a full page load, and the page size chosen on arrival below would overtake it.
  const interactive = React.useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [pending, startTransition] = React.useTransition();
  const listRef = React.useRef<HTMLDivElement>(null);
  // The open game: from a card (it opens under the card, and closes if a refresh takes it off the
  // page) or from a link (?match= on arrival or Back/Forward: under its card when it is on the
  // page, else in the match window).
  const [open, setOpen] = React.useState<{ id: string; via: "card" | "link" } | null>(() => {
    const id = params.get("match");
    return id ? { id, via: "link" } : null;
  });
  const champ = (id: string): PortraitChampion => championsById[id] ?? { id, name: id, portraitUrl: "" };
  // One function for every card's team icons (stable while the champions are, so memoised cards stay equal).
  const champOrUnknown = React.useCallback((id: string | null): PortraitChampion => (id ? (championsById[id] ?? fallbackChampion(id)) : UNKNOWN_CHAMPION), [championsById]);
  const onPage = React.useMemo(() => new Set(data.rows.map((r) => r.matchId)), [data.rows]);
  const inline = open && onPage.has(open.id) ? open.id : null;
  const windowed = open && open.via === "link" && !onPage.has(open.id) ? open.id : null;

  const latestParams = React.useRef({ params, pathname });
  React.useLayoutEffect(() => {
    latestParams.current = { params, pathname };
  });
  /** The open game in the address, replacing the current entry (Back leaves the page, not the game). */
  const writeMatch = React.useCallback((matchId: string | null) => {
    const { params, pathname } = latestParams.current;
    const next = new URLSearchParams(params.toString());
    if (matchId) next.set("match", matchId);
    else next.delete("match");
    window.history.replaceState(null, "", `${pathname}${next.size ? `?${next.toString()}` : ""}`);
  }, []);

  const go = React.useCallback(
    (patch: Record<string, string | null>, { keepMatch = false }: { keepMatch?: boolean } = {}) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!keepMatch) {
        next.delete("match");
        setOpen(null);
      }
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  // Page size from the space left on screen (phones use a fixed size and scroll).
  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const phone = window.innerWidth < 768;
    const room = window.innerHeight - el.getBoundingClientRect().top - 56;
    const rowPx = ROW_REM * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);
    const fits = phone ? PHONE_PER : Math.max(10, Math.min(25, Math.floor(room / rowPx)));
    if (fits !== data.per && data.total > 0) {
      const firstIndex = (data.page - 1) * data.per;
      // The game a link opened stays open (it is still on the new page, or opens in the window).
      go({ per: String(fits), page: String(Math.floor(firstIndex / fits) + 1) }, { keepMatch: true });
    }
    // Only on arrival and when the list changes size class, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.per, data.total]);

  // Ranks a breakdown checked with Riot, by match and place: its card shows them at once. They
  // belong to this page of data; the next one reads them from storage like every other rank.
  const [checked, setChecked] = React.useState<{ data: MatchHistoryPage; ranks: Record<string, ReadonlyMap<number, ParticipantRank>> }>({ data, ranks: {} });
  const checkedRanks = checked.data === data ? checked.ranks : NO_CHECKED;
  // Details this page has loaded (a new one with every new page of data, see MatchDetailCache).
  const cache = React.useMemo<MatchDetailCache>(
    () =>
      createMatchDetailCache({
        onRanks: (matchId, r) => {
          if (r.status !== "ok" || !r.check.found) return;
          const ranks = new Map(r.ranks.map((x) => [x.slot, x.rank]));
          setChecked((prev) => ({ data, ranks: { ...(prev.data === data ? prev.ranks : {}), [matchId]: ranks } }));
        },
      }),
    [data],
  );
  const prefetch = React.useCallback((matchId: string) => void cache.load(playerId, matchId).catch(() => {}), [cache, playerId]);
  // A player met in other games, from an open game's scoreboard: their Encounters window, in the
  // list's season, game mode and account (the counts the scoreboard showed).
  const [met, setMet] = React.useState<{ key: string; name: string } | null>(null);
  const { season, mode, accountId } = data.filter;
  const encounterLink = React.useMemo<EncounterLink>(() => ({ scope: { season, mode, accountId }, open: setMet }), [season, mode, accountId]);
  const openRef = React.useRef(open);
  React.useLayoutEffect(() => {
    openRef.current = open;
  });
  // Set when a card opens, so the card is brought into view once it has (see below).
  const reveal = React.useRef<string | null>(null);
  const toggle = React.useCallback(
    (matchId: string) => {
      const next = openRef.current?.id === matchId ? null : matchId;
      setOpen(next ? { id: next, via: "card" } : null);
      reveal.current = next;
      writeMatch(next);
    },
    [writeMatch],
  );
  // An opened card that sits low on the screen, or above it (the game open before it closed and
  // the list moved up), is scrolled to the top so its breakdown is in view; one already in the
  // upper part of the screen stays where it is.
  React.useLayoutEffect(() => {
    if (!inline || reveal.current !== inline) return;
    reveal.current = null;
    revealOpened(document.getElementById(`match-${inline}`));
  }, [inline]);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (windowed) returnFocus.current = document.activeElement as HTMLElement | null;
  }, [windowed]);
  const closeWindow = () => {
    setOpen(null);
    writeMatch(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  };
  // Back and Forward follow the address: the game it names opens (under its card when on the page).
  React.useEffect(() => {
    const onPop = () => {
      const id = new URLSearchParams(window.location.search).get("match");
      setOpen(id ? { id, via: "link" } : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const f = data.filter;
  const narrowed = f.role || f.scope !== "all" || f.accountId || f.mode !== "all" || f.season !== data.currentSeason || narrowsGames(data.refine);
  // Refine's own choices ride along every change of the shared filters; a change of them starts again at the newest games.
  const keep = { per: String(data.per), ...refineParams(data.refine) };
  const refineTo = (patch: Record<string, string | null>) => go({ ...patch, page: null });
  // Grouping keeps the page and an open game: the games and their order stay the same.
  const groupTo = (sessions: boolean) => go({ group: sessions ? "sessions" : null }, { keepMatch: true });
  // The page's games by playing session, when grouped (a session cut by the page break shows its part here).
  const sessionGroups = data.refine.sessions && data.rows.length ? groupBySession(data.rows, data.sessionOf) : null;
  const card = (r: MatchRow) => <MatchCard key={r.matchId} row={r} playerId={playerId} champion={championsById[r.championId] ?? fallbackChampion(r.championId)} champ={champOrUnknown} onToggle={toggle} onPrefetch={prefetch} expanded={inline === r.matchId} checked={checkedRanks[r.matchId]} />;

  return (
    <section className="space-y-3" aria-labelledby="match-history" data-testid="match-history" data-accounts-linked={data.accountsLinked} data-total={data.total} data-ready={interactive ? "true" : undefined}>
      {/* Browsing individual games: the profile's one heading layout (as Overview and All
          Champions): the title and the switch to the players met (Encounters), the data status
          under them, and the toolbar: the filters (the scope they set is readable in them), then
          Refresh; then a line about the newest games, then the games. Season totals and averages
          belong to the profile's Overview. */}
      <SectionHeader
        id="match-history"
        title="Match History"
        aside={<MatchViewSwitch view="games" basePath={basePath} filter={f} />}
        status={status ? <DataStatusNote status={status} refresh={refresh} /> : null}
        refresh={status ? <RefreshButton status={status} refresh={refresh ? { ...refresh, onNewGames: data.page > 1 ? { label: "Show the newest", run: () => go({ page: "1" }) } : undefined } : null} /> : null}
        controls={
          <div aria-busy={pending} className="min-w-0">
            <OverviewFilters
              basePath={basePath}
              filter={f}
              seasons={data.seasons}
              currentSeason={data.currentSeason}
              champions={data.championOptions.map((c) => ({ id: c.id, name: champ(c.id).name, games: c.games, portraitUrl: champ(c.id).portraitUrl }))}
              accounts={data.accountOptions}
              keep={keep}
              modeCounts={data.modes.counts}
              testId="match-filters"
              refineLabel="Refine the games"
              extraFields={<HistoryRefineFields refine={data.refine} options={data} set={refineTo} group={groupTo} pending={pending} />}
              extraRefinements={historyRefinements(data.refine, data, refineTo, groupTo)}
            />
          </div>
        }
      />

      {data.summary ? <HistorySummaryStrip summary={data.summary} ladder={data.ladder} championsById={championsById} /> : null}

      <MatchDetailCacheContext.Provider value={cache}>
        <EncounterLinkContext.Provider value={encounterLink}>
          <div ref={listRef} className={cn("transition-opacity", pending && "opacity-60")}>
            {data.total === 0 ? (
              <p className="rounded-panel border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted" data-testid="match-empty">
                {data.accountsLinked === 0 ? "No Riot account is linked yet: games appear here once one is linked and synced." : narrowed ? "No stored game matches these filters." : data.syncing ? "No games stored for this season yet; the first sync is collecting them and this page fills in by itself." : "No games stored for this season."}
                <ModeElsewhere basePath={basePath} filter={f} elsewhere={data.modes.elsewhere} keep={keep} />
              </p>
            ) : sessionGroups ? (
              <ol className="@container/mh space-y-4" aria-label={`Playing sessions, page ${data.page} of ${data.pages}`} data-testid="match-sessions">
                {sessionGroups.map((g) => {
                  const summary = data.sessions[g.key];
                  return (
                    <li key={g.key} className="space-y-1.5" data-testid="session" data-games={summary?.games ?? g.rows.length}>
                      {summary ? <SessionHeader summary={summary} onPage={g.rows.length} /> : null}
                      <ol className="space-y-1.5">{g.rows.map(card)}</ol>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <ol className="@container/mh space-y-1.5" aria-label={`Page ${data.page} of ${data.pages}`}>
                {data.rows.map(card)}
              </ol>
            )}
          </div>

          {data.pages > 1 ? <Pages page={data.page} pages={data.pages} total={data.total} per={data.per} pending={pending} go={(p) => go({ page: String(p) })} /> : null}

          {windowed ? <MatchDetailModal playerId={playerId} matchId={windowed} championsById={championsById} onClose={closeWindow} /> : null}
          {met ? <EncounterWindow target={met} playerId={playerId} playerName={playerName} filters={{ season, mode, accountId }} championsById={championsById} onClose={() => setMet(null)} /> : null}
        </EncounterLinkContext.Provider>
      </MatchDetailCacheContext.Provider>
    </section>
  );
}

/** The page's games in their playing sessions, in the page's order (sessions are runs of the list, newest first). */
function groupBySession(rows: readonly MatchRow[], sessionOf: Readonly<Record<string, string>>): Array<{ key: string; rows: MatchRow[] }> {
  const groups: Array<{ key: string; rows: MatchRow[] }> = [];
  for (const r of rows) {
    const key = sessionOf[r.matchId] ?? r.matchId;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else groups.push({ key, rows: [r] });
  }
  return groups;
}

/** "29 Oct, 7:12 pm – 10:40 pm · 5 games · 3W 2L · 3.21 KDA · 7.4 CS/min · 2 h 10 min played" (wins and losses in the cards' colours). */
function SessionHeader({ summary: s, onPage }: { summary: SessionSummary; onPage: number }) {
  const minutes = Math.round(s.minutes);
  const played = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-1 text-xs text-fg-muted" data-testid="session-header">
      <h3 className="text-sm font-semibold text-fg">
        {formatDayMonth(s.start)}, {formatTimeOfDay(s.start)} – {formatTimeOfDay(s.end)}
      </h3>
      <span className="tabular-nums">
        {formatCount(s.games)} {s.games === 1 ? "game" : "games"} · <span className="text-blue">{formatCount(s.wins)}W</span> <span className="text-red">{formatCount(s.losses)}L</span>
      </span>
      {s.kda !== null ? <span className="tabular-nums">{s.perfect ? "Perfect KDA" : `${formatNumber(s.kda, 2)} KDA`}</span> : null}
      {s.csPerMinute !== null ? <span className="tabular-nums">{formatNumber(s.csPerMinute, 1)} CS/min</span> : null}
      {minutes > 0 ? <span className="tabular-nums">{played} played</span> : null}
      {onPage < s.games ? <span className="text-fg-subtle">{formatCount(onPage)} of them on this page</span> : null}
    </div>
  );
}

/** Compact page controls: arrows, the ends and the neighbourhood of the current page. */
function Pages({ page, pages, total, per, pending, go }: { page: number; pages: number; total: number; per: number; pending: boolean; go: (p: number) => void }) {
  const arrow = "grid h-10 w-10 place-items-center rounded-lg border border-border text-fg-muted hover:border-border-strong hover:text-fg disabled:opacity-40 md:h-8 md:w-8";
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  return (
    <nav aria-label="Match history pages" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1" data-testid="match-pages">
      <span className="flex items-center gap-1">
        <button type="button" disabled={page <= 1 || pending} onClick={() => go(page - 1)} className={arrow} aria-label="Newer games" data-testid="match-prev">
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === "gap" ? (
            <span key={`g${i}`} className="px-0.5 text-fg-subtle" aria-hidden>
              …
            </span>
          ) : (
            <button key={p} type="button" aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`} onClick={() => go(p)} className={cn("h-10 min-w-10 rounded-lg px-1.5 text-sm tabular-nums md:h-8 md:min-w-8", p === page ? "bg-accent/15 font-semibold text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
              {p}
            </button>
          ),
        )}
        <button type="button" disabled={page >= pages || pending} onClick={() => go(page + 1)} className={arrow} aria-label="Older games" data-testid="match-next">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </span>
      <span className="text-xs tabular-nums text-fg-subtle">
        Games {from}–{to} of {formatCount(total)}
      </span>
    </nav>
  );
}
