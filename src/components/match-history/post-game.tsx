"use client";

import * as React from "react";
import { getMatchGroupsAction, getMatchMeetingsAction, getMatchRanksAction, getMatchTimelineAction, type MatchMeetingsResult } from "@/server/actions/match-history";
import type { MatchGroupsResult } from "@/server/matches/possible-groups";
import type { MatchTimelineResult, TimelinePlayerView } from "@/server/accounts/match-timeline";
import type { DetailParticipant, Icon, MatchDetailView, MatchRanksResult } from "@/server/players/match-history";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { BookmarkButton } from "@/components/matches/bookmark-button";
import { Undo2 } from "lucide-react";
import { formatCount, formatDateTime, formatKilo } from "@/lib/format";
import { laneOf } from "@/domain/match-analysis";
import { ParticipantPanels, type PanelKey } from "./participant-panels";
import { ScoreSummary, ScoreTimeline } from "./performance-panel";
import { usePhone } from "@/components/ui/use-phone";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { gameScoresOf } from "@/domain/performance-inputs";
import { cn } from "@/lib/cn";
import { MatchDetailCacheContext, type MeetingScope } from "./match-detail-cache";
import { OpggHistoryLink } from "./opgg-history-link";
import { Scoreboard, ScoreboardNotes, shownName } from "./scoreboard";
import { IconImg } from "./icon-img";
import { publicPatchName } from "@/domain/patch";

/*
  One game after it was played, in one view, the same wherever a game opens: under its card in
  Match History and Team → Matches, and in the match window (a phone's whole screen, Matchups,
  Encounters, a link to a game not on the page). Redrawn at the owner's request of 24 Nov 2026
  (docs/DESIGN_SYSTEM.md, "The post-game view") as one integrated post-game screen, nothing in it
  scrolling:
  - The player inspected (the profile's player as the game opens, or any of the ten chosen in the
    scoreboard: a click, a tap, Enter; ↑ and ↓ move between its rows): their name, champion and
    role, their performance score with its place, MVP or ACE; the loadout as the client draws it
    (the portrait and level; spells and runes two by two; the six items two rows of three with the
    trinket beside the first row); six figures; the other recorded figures in a grid of three
    groups, ordered by role; Build Path | Skill Order | Runes over one area of fixed height; the lane
    by role against the lane opponent at 10:00, 15:00 and the end.
  - The scoreboard: both teams as one component, every player's score and place in their row; one
    quiet line under it (ranks and possible groups, each with its (i), the date, the bookmark and
    OP.GG); and the inspected player's score through the game.
  Every part above the scoreboard and beside it keeps its height whoever is inspected, so the rows
  never move as another player is chosen. Widths (the view's own, @container/pg): from 56rem two
  columns (the player, then the scoreboard); 40–56rem the player beside the build and the lane,
  the scoreboard under both; under 40rem one column. A phone's window shows one of three pages at a
  time (Player, Build, Scoreboard: the shared segmented control), each within its screen, instead of
  one long scrolling column. The timeline is asked for once as the game opens (stored, about 10–20
  KB, every player's in it; Riot is asked at most once per game, ever). Inspecting another player
  reads nothing more, and is not written to the address (Back still closes the game).
*/
/** Match History's way from a game's scoreboard to Encounters: the list's scope, and the address of a player's games. */
export interface EncounterLink {
  scope: MeetingScope;
  href(key: string): string;
}

/** Given by Match History's list; a game opened over it marks the players met in its other games. */
export const EncounterLinkContext = React.createContext<EncounterLink | null>(null);

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${formatCount(Math.abs(Math.round(v)))}`;

function useResult<T>(run: (() => Promise<T>) | null, fallback: T, deps: React.DependencyList): T | null {
  const [value, setValue] = React.useState<T | null>(null);
  React.useEffect(() => {
    if (!run) return;
    let live = true;
    void run()
      .catch(() => fallback)
      .then((r) => {
        if (live) React.startTransition(() => setValue(r));
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/**
 * An icon of the loadout that names itself: on hover and keyboard focus (desktop) and on a tap
 * (touch), its name shows in the loadout's caption line, which always sits inside the screen.
 */
function Named({ icon, size, rounded, onName, className }: { icon: Icon | null; size: number; rounded?: string; onName: (name: string | null) => void; className?: string }) {
  if (!icon) return <IconImg icon={null} size={size} rounded={rounded} className={cn("bg-black/35 ring-1 ring-inset ring-border/70", className)} />;
  return (
    <button
      type="button"
      aria-label={icon.name}
      className={cn("shrink-0 rounded focus-visible:outline-2 focus-visible:outline-accent", rounded)}
      onMouseEnter={() => onName(icon.name)}
      onMouseLeave={() => onName(null)}
      onFocus={() => onName(icon.name)}
      onBlur={() => onName(null)}
      onClick={() => onName(icon.name)}
      data-testid="loadout-icon"
    >
      <IconImg icon={icon} size={size} rounded={rounded} className={cn("ring-1 ring-inset ring-border/70", className)} />
    </button>
  );
}

/** The loadout, as the client's scoreboard and HUD draw it (the rune page is under Runes), with the score beside it and the line an icon names itself in. */
function Loadout({ p, champ, score }: { p: DetailParticipant; champ: PortraitChampion; score: React.ReactNode }) {
  const [name, setName] = React.useState<string | null>(null);
  const two = p.spells?.length ? p.spells.slice(0, 2) : [null, null];
  return (
    <div className="flex items-center gap-2.5" data-testid="post-game-loadout">
      <span className="relative shrink-0">
        <ChampionPortrait champion={champ} size="lg" className="h-14 w-14" />
        {p.champLevel !== null ? (
          <span className="absolute -bottom-1 -right-1 rounded bg-bg px-1 text-xs font-semibold tabular-nums leading-4 text-fg" data-testid="champion-level">
            <span className="sr-only">Level </span>
            {p.champLevel}
          </span>
        ) : null}
      </span>
      <span className="grid shrink-0 grid-flow-col grid-rows-2 gap-1">
        {two.map((s, i) => (
          <Named key={`s${i}`} icon={s} size={24} onName={setName} />
        ))}
        <Named icon={p.keystone} size={24} rounded="rounded-full" onName={setName} />
        <Named icon={p.secondary} size={24} rounded="rounded-full" onName={setName} className="p-0.5" />
      </span>
      {/* The inventory: two rows of three with the trinket beside the first, in inset slots; an empty slot is a quiet tile (a post-game inventory with empty slots is truthful). */}
      <span className="grid shrink-0 grid-cols-4 gap-0.5 rounded-lg bg-black/25 p-0.5" role="group" aria-label="Items" data-testid="post-game-items">
        {p.items
          ? [0, 1, 2, 6, 3, 4, 5].map((i) => <Named key={i} icon={p.items![i] ?? null} size={26} rounded={i === 6 ? "rounded-full" : "rounded"} onName={setName} />)
          : <span className="col-span-4 w-28 px-1 text-xs text-fg-subtle">Items not recorded</span>}
      </span>
      <span className="flex h-14 min-w-0 flex-1 flex-col items-end justify-between">
        {score}
        <span className="block h-4 w-full truncate text-right text-xs leading-4 text-fg-muted" aria-hidden data-testid="loadout-name">
          {name ?? ""}
        </span>
      </span>
    </div>
  );
}

function Figure({ label, value, sub, testId }: { label: string; value: string; sub: string | null; testId: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="truncate text-2xs font-medium uppercase leading-4 tracking-label text-fg-subtle">{label}</div>
      <div className="text-base font-semibold leading-5 tabular-nums text-fg">{value}</div>
      <div className="truncate text-xs leading-4 tabular-nums text-fg-muted">{sub ?? " "}</div>
    </div>
  );
}

/** Six figures, each of the player's figures once in the whole view: no card each, a grid of aligned columns. */
function Figures({ p, teamKills }: { p: DetailParticipant; teamKills: number }) {
  return (
    // Six across where the player's part is at least 37rem wide (a tablet's one column), else three by two.
    <div className="@container/fig">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 @min-[37rem]/fig:grid-cols-6" data-testid="post-game-figures">
        <Figure label="K/D/A" value={`${p.kills} / ${p.deaths} / ${p.assists}`} sub={p.deaths === 0 ? "Perfect KDA" : `${p.kda.toFixed(2)} KDA`} testId="figure-kda" />
        <Figure label="CS" value={p.cs === null ? "—" : formatCount(p.cs)} sub={p.csPerMin === null ? null : `${p.csPerMin.toFixed(1)} / min`} testId="figure-cs" />
        <Figure label="Gold" value={p.gold === null ? "—" : formatKilo(p.gold)} sub={p.goldPerMin === null ? null : `${formatCount(Math.round(p.goldPerMin))} / min`} testId="figure-gold" />
        <Figure label="Damage" value={p.damage === null ? "—" : formatKilo(p.damage)} sub={p.damageShare === null ? null : `${pct(p.damageShare)} of team`} testId="figure-damage" />
        <Figure label="Vision" value={p.vision === null ? "—" : formatCount(p.vision)} sub={p.wardsPlaced === null ? null : `${formatCount(p.wardsPlaced)} wards`} testId="figure-vision" />
        <Figure label="KP" value={pct(p.killParticipation)} sub={teamKills > 0 ? `of ${formatCount(teamKills)} kills` : null} testId="figure-kp" />
      </div>
    </div>
  );
}

type StatGroup = { key: "combat" | "utility" | "objectives"; label: string; rows: Array<[key: string, label: string, value: string, spoken?: string]> };

/** The groups' order for a role: a support's utility first, a jungler's objectives, everyone else's combat. */
export function statGroupOrder(position: string | null): Array<StatGroup["key"]> {
  const lane = laneOf(position);
  if (lane === "UTILITY") return ["utility", "combat", "objectives"];
  if (lane === "JUNGLE") return ["objectives", "combat", "utility"];
  return ["combat", "objectives", "utility"];
}

/**
 * The figures the six leave out, in three groups of aligned rows (Combat, Utility, Objectives),
 * ordered by the player's role. Every row is always there, so the grid keeps its height whoever is
 * inspected: "—" where the record does not have the figure, "0" where it recorded none.
 */
function MoreStats({ p, support }: { p: DetailParticipant; support: boolean }) {
  const st = p.stats;
  const kilo = (v: number | null | undefined) => (typeof v === "number" ? formatKilo(v) : "—");
  const count = (v: number | null | undefined) => (typeof v === "number" ? formatCount(v) : "—");
  const healed = typeof st?.teamHealing === "number" || typeof st?.teamShielding === "number" ? (st?.teamHealing ?? 0) + (st?.teamShielding ?? 0) : null;
  const groups: Record<StatGroup["key"], StatGroup> = {
    combat: {
      key: "combat",
      label: "Combat",
      rows: [
        ["taken", "Taken", kilo(p.damageTaken), "Damage taken"],
        ["mitigated", "Mitigated", kilo(st?.damageMitigated), "Damage mitigated"],
        ["cc", "CC", typeof st?.ccSeconds === "number" ? `${formatCount(st.ccSeconds)} s` : "—", "Crowd control"],
      ],
    },
    utility: {
      key: "utility",
      label: "Utility",
      rows: [
        ["protect", "Heal + shield", kilo(healed)],
        ["wardsKilled", "Wards cleared", count(st?.wardsKilled)],
        ["control", "Control wards", count(st?.controlWardsBought)],
      ],
    },
    objectives: {
      key: "objectives",
      label: "Objectives",
      rows: [
        ["objectives", "Damage", kilo(st?.objectiveDamage), "Objective damage"],
        ["turrets", "Turrets", count(st?.turretTakedowns)],
      ],
    },
  };
  const order = statGroupOrder(support ? "UTILITY" : p.position);
  return (
    <div className="grid grid-cols-3 gap-x-3" data-testid="post-game-more" data-order={order.join(" ")}>
      {order.map((k) => {
        const g = groups[k];
        return (
          <section key={k} aria-label={g.label} className="min-w-0" data-testid={`more-${k}`}>
            <p className="truncate text-2xs font-medium uppercase leading-4 tracking-label text-fg-subtle" aria-hidden>
              {g.label}
            </p>
            <dl className="text-2xs leading-4">
              {g.rows.map(([key, label, value, spoken]) => (
                <div key={key} className="flex items-baseline justify-between gap-1.5" data-testid={`more-${key}`}>
                  <dt className="min-w-0 truncate text-fg-muted">
                    {spoken ? (
                      <>
                        <span aria-hidden>{label}</span>
                        <span className="sr-only">{spoken}</span>
                      </>
                    ) : (
                      label
                    )}
                  </dt>
                  <dd className="shrink-0 font-medium tabular-nums text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The lane by role: the player against the lane opponent at 10:00, 15:00 and the end (signed, plain),
 * and the bot lane's two against two at 10:00 as a row of its own. Its area keeps one height (four
 * rows) whoever is inspected. The 10:00 and 15:00 columns show while the timeline loads and once it
 * gives a figure; a game without them shows the end alone (the build path's place says why).
 */
function Lane({ view, champ, me, entry, state }: { view: MatchDetailView; champ: (id: string | null) => PortraitChampion; /** The player inspected. */ me: DetailParticipant; /** Their timeline, every player's in the one answer. */ entry: TimelinePlayerView | null; state: "loading" | "ok" | "missing" }) {
  const opp = me.laneOpponentSlot;
  const box = "@container/lane min-h-26 min-w-0";
  if (opp === null)
    return (
      <section aria-label="Lane" className={box} data-testid="post-game-lane" data-state="unclear">
        <p className="text-2xs font-semibold uppercase leading-5 tracking-label text-fg-subtle">Lane</p>
        <p className="text-xs text-fg-subtle">Lane opponent not clear in this game</p>
      </section>
    );
  const them = view.teams.flatMap((t) => t.participants).find((x) => x.slot === opp) ?? null;
  const c = champ(them?.championId ?? null);
  // The profile's own role is the ledger's; anyone else's is their recorded position.
  const support = me.isPlayer ? view.role === "SUPPORT" : laneOf(me.position) === "UTILITY";
  const at = (m: number) => entry?.lane?.moments.find((x) => x.minute === m);
  const cell = (m: number, key: "cs" | "gold" | "xp") => {
    const x = at(m);
    return x?.you && x.opponent ? signed(x.you[key] - x.opponent[key]) : "—";
  };
  const end = (a: number | null | undefined, b: number | null | undefined) => (typeof a === "number" && typeof b === "number" ? signed(a - b) : "—");
  const rows: Array<[string, string, string, string]> = [
    ...(support ? [] : [["CS", cell(10, "cs"), cell(15, "cs"), end(me.cs, them?.cs)] as [string, string, string, string]]),
    ["Gold", cell(10, "gold"), cell(15, "gold"), end(me.gold, them?.gold)],
    support ? ["XP · vision", cell(10, "xp"), cell(15, "xp"), end(me.vision, them?.vision)] : ["XP · level", cell(10, "xp"), cell(15, "xp"), end(me.champLevel, them?.champLevel)],
  ];
  // Columns of dashes say nothing: 10:00 and 15:00 only while they may still fill, or once one has a figure.
  const timed = state === "loading" || rows.some(([, a, b]) => a !== "—" || b !== "—");
  const pair = entry?.pair ?? null;
  const name = (slot: number) => champ(view.teams.flatMap((t) => t.participants).find((x) => x.slot === slot)?.championId ?? null).name;
  return (
    <section aria-label="Lane" className={box} data-testid="post-game-lane" data-state="clear" data-timed={timed || undefined}>
      {/* Under 20rem (a phone at large text) each row's name stands on a line of its own, its figures under it, so nothing runs past the screen. */}
      <table className={cn("w-full text-sm leading-5 tabular-nums", "@max-[20rem]/lane:block @max-[20rem]/lane:[&_tbody]:block @max-[20rem]/lane:[&_td]:block @max-[20rem]/lane:[&_th]:block @max-[20rem]/lane:[&_th]:w-auto @max-[20rem]/lane:[&_thead]:block @max-[20rem]/lane:[&_tr]:grid @max-[20rem]/lane:[&_tr]:grid-cols-3 @max-[20rem]/lane:[&_tr>th:first-child]:col-span-3")}>
        <thead>
          <tr className="text-2xs text-fg-subtle">
            <th className="text-left font-semibold">
              <span className="flex items-center gap-1.5 uppercase tracking-label">
                Lane vs
                <ChampionPortrait champion={c} size="xs" className="h-4 w-4 rounded" />
                <span className="truncate text-xs font-semibold normal-case tracking-normal text-fg">{c.name}</span>
                <span className="sr-only">: you minus them</span>
              </span>
            </th>
            {timed ? (
              <>
                <th className="w-14 text-right font-medium">10:00</th>
                <th className="w-14 text-right font-medium">15:00</th>
              </>
            ) : null}
            <th className="w-14 text-right font-medium">End</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, a, b, e]) => (
            <tr key={label}>
              <th scope="row" className="text-left text-xs font-normal text-fg-muted">
                {label}
              </th>
              {timed ? (
                <>
                  <td className="text-right text-fg">{a}</td>
                  <td className="text-right text-fg">{b}</td>
                </>
              ) : null}
              <td className="text-right font-medium text-fg">{e}</td>
            </tr>
          ))}
          {pair ? (
            <tr data-testid="post-game-pair">
              <th scope="row" className="text-left text-xs font-normal text-fg-muted">
                Bot 2v2 gold
                <span className="sr-only">
                  , with {name(pair.allySlot)} against {name(pair.opponentSlots[0])} and {name(pair.opponentSlots[1])}
                </span>
              </th>
              {timed ? (
                <>
                  <td className="text-right text-fg">{signed(pair.gold)}</td>
                  <td className="text-right text-fg-subtle" aria-hidden />
                </>
              ) : null}
              <td className="text-right text-fg-subtle" aria-hidden />
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

const POSITION_WORDS: Record<string, string> = { TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bottom", UTILITY: "Support" };

/** The 40–56rem grid (a tablet): the player beside the build and the lane, the score through the game under those, the scoreboard across. */
const MID = "@min-[40rem]/pg:@max-[56rem]/pg:grid-cols-2 @min-[40rem]/pg:@max-[56rem]/pg:[grid-template-areas:'player_side'_'player_chart'_'board_board']";

type PhonePage = "player" | "build" | "board";
const PHONE_PAGES: Array<{ key: PhonePage; label: string }> = [
  { key: "player", label: "Player" },
  { key: "build", label: "Build" },
  { key: "board", label: "Scoreboard" },
];

export function PostGame({ playerId, view, champ, variant, encounterLinks = false }: { playerId: string; view: MatchDetailView; champ: (id: string | null) => PortraitChampion; variant: "inline" | "window"; /** A window over the list itself (a phone's whole-screen game): its marks may lead to the list's Encounters, as under a card. */ encounterLinks?: boolean }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const id = view.matchId;
  // The timeline first (the lane, the build path, the skill order and the scores read it), then the possible groups, the rank check and the players met, each after the view is on screen.
  const timeline = useResult<MatchTimelineResult>(() => (cache ? cache.timeline(playerId, id) : getMatchTimelineAction(playerId, id)), { status: "error", message: "" }, [cache, playerId, id]);
  const groups = useResult<MatchGroupsResult>(() => (cache ? cache.groups(playerId, id) : getMatchGroupsAction(playerId, id)), { status: "unavailable", message: "" }, [cache, playerId, id]);
  const ranks = useResult<MatchRanksResult>(view.rankCheck ? () => (cache ? cache.ranks(playerId, id) : getMatchRanksAction(playerId, id)) : null, { status: "not-found", message: "" }, [cache, playerId, id, view.rankCheck]);
  const link = React.useContext(EncounterLinkContext);
  const meetScope = variant === "inline" || encounterLinks ? (link?.scope ?? null) : null;
  const meetings = useResult<MatchMeetingsResult>(meetScope ? () => (cache ? cache.meetings(playerId, id, meetScope) : getMatchMeetingsAction(playerId, id, meetScope)) : null, { status: "not-found", message: "" }, [cache, playerId, id, meetScope]);
  const checked = React.useMemo(() => new Map(ranks?.status === "ok" ? ranks.ranks.map((r) => [r.slot, r.rank]) : []), [ranks]);
  const met = React.useMemo(() => new Map(meetings?.status === "ok" ? meetings.players.map((m) => [m.slot, m]) : []), [meetings]);
  const meetHref = link && meetScope ? link.href : null;
  const rankOf = React.useCallback((x: DetailParticipant) => checked.get(x.slot) ?? x.rank, [checked]);
  const checking = view.rankCheck && !ranks;
  const tl = timeline?.status === "ok" ? timeline.timeline : null;
  const state = !timeline ? "loading" : timeline.status === "ok" ? "ok" : "missing";
  // The player inspected (the profile's own as the game opens): client state only.
  const [selected, setSelected] = React.useState(view.player.slot);
  const [panel, setPanel] = React.useState<PanelKey>("build");
  // A phone's window, or one in a window under 481px tall (a phone held sideways), shows one page at
  // a time (the window's own screen, never a long scroll).
  const phone = usePhone();
  const short = useShortWindow();
  const paged = (phone || short) && variant === "window";
  const [page, setPage] = React.useState<PhonePage>("player");
  const all = React.useMemo(() => view.teams.flatMap((t) => t.participants), [view.teams]);
  const subject = all.find((p) => p.slot === selected && !p.removed) ?? view.player;
  const entry = tl?.players.find((p) => p.slot === subject.slot) ?? null;
  // The scores, once the timeline has answered (its lane at 10:00 and 15:00 is one of their figures), from what is loaded.
  const { scores, points } = React.useMemo(() => (timeline ? gameScoresOf(view, tl) : { scores: null, points: null }), [timeline, tl, view]);
  const scoreOf = React.useCallback((slot: number) => scores?.players.find((p) => p.slot === slot) ?? null, [scores]);
  const subjectTeam = view.teams.find((t) => t.participants.some((p) => p.slot === subject.slot)) ?? view.teams[0];
  const nameOf = React.useCallback((p: DetailParticipant) => shownName(p, champ(p.championId).name), [champ]);
  const own = subject.isPlayer;
  const mine = scoreOf(subject.slot);
  // The row pressed stays under the finger if anything above it changes height (nothing should:
  // every part above the scoreboard keeps its height): measured before the switch and after it, and
  // its scroller moved by the difference. Done here, not by the browser's scroll anchoring, which
  // Safari does not have (the breakdown opts out of it below, so Chromium and Firefox do not correct twice).
  const anchor = React.useRef<{ el: Element; top: number } | null>(null);
  const select = React.useCallback((slot: number, from?: Element | null) => {
    anchor.current = from ? { el: from, top: from.getBoundingClientRect().top } : null;
    setSelected(slot);
  }, []);
  // On a phone's pages a tap on a row shows that player's page: the row's own page has nothing of them but the row.
  const inspect = React.useCallback((slot: number, from?: Element | null) => {
    if (paged) {
      setSelected(slot);
      setPage("player");
      return;
    }
    select(slot, from);
  }, [paged, select]);
  React.useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (!a || !a.el.isConnected) return;
    const moved = a.el.getBoundingClientRect().top - a.top;
    if (Math.abs(moved) < 0.5) return;
    scrollerOf(a.el).scrollBy(0, moved);
  }, [subject.slot]);
  // ↑ and ↓ between the ten rows (both teams), Home and End to the first and last; Enter and Space are the rows' own buttons.
  const onRowKeys = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-testid=participant-select]")];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)));
    rows.forEach((r, i) => (r.tabIndex = i === next ? 0 : -1));
    rows[next]!.focus();
  };
  const position = subject.position ? POSITION_WORDS[laneOf(subject.position) ?? ""] : undefined;
  const support = subject.isPlayer ? view.role === "SUPPORT" : laneOf(subject.position) === "UTILITY";
  /** On a phone's pages, hidden unless its page is shown (kept in the page, so nothing reloads). */
  const on = (p: PhonePage) => (paged && page !== p ? "hidden" : undefined);
  const meta = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden" data-testid="post-game-meta">
      <span className={cn("tabular-nums", variant === "window" && "hidden")} data-testid="match-breakdown-when">
        {formatDateTime(new Date(view.playedAt))}
        {view.patch ? ` · Patch ${publicPatchName(view.patch)}` : ""}
      </span>
      {view.share.eligible ? <BookmarkButton matchId={view.matchId} bookmarked={view.share.shared} share /> : null}
      {view.player.opgg ? <OpggHistoryLink href={view.player.opgg} account={view.player.name?.split("#")[0]?.trim() || null} /> : null}
    </span>
  );
  return (
    <div className="@container/pg [overflow-anchor:none]" data-testid="match-breakdown" data-variant={variant} data-met={meetings ? (meetings.status === "ok" ? meetings.players.length : 0) : undefined} data-timeline={timeline ? timeline.status : "loading"} data-selected={subject.slot} data-paged={paged || undefined} data-page={paged ? page : undefined}>
      {paged ? (
        <div role="radiogroup" aria-label="Show the player, the build or the scoreboard" className={segmentedGroupClass("mb-2.5 flex w-full flex-wrap [&>*]:flex-1")} data-testid="post-game-pages">
          {PHONE_PAGES.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={page === p.key}
              tabIndex={page === p.key ? 0 : -1}
              onClick={() => setPage(p.key)}
              onKeyDown={(e) => {
                const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                if (!step) return;
                e.preventDefault();
                const next = PHONE_PAGES[(PHONE_PAGES.findIndex((x) => x.key === p.key) + step + PHONE_PAGES.length) % PHONE_PAGES.length]!;
                setPage(next.key);
                (e.currentTarget.parentElement?.querySelector(`[data-testid=post-game-page-${next.key}]`) as HTMLElement | null)?.focus();
              }}
              className={segmentClass(page === p.key)}
              data-testid={`post-game-page-${p.key}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      {/* From 56rem two columns (the player, then the scoreboard and the score through the game).
          From 40rem to 56rem the two columns' parts share one grid: the player beside the build
          and the lane, the score through the game under those, and the scoreboard across. */}
      <div className={cn("grid gap-x-5 gap-y-2.5 @min-[40rem]/pg:gap-y-3 @min-[56rem]/pg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] @min-[64rem]/pg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] @min-[80rem]/pg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]", MID)}>
        <div className="grid min-w-0 content-start gap-y-3 @min-[40rem]/pg:@max-[56rem]/pg:contents">
          <section aria-label={own && view.own ? "Your game" : `${nameOf(subject)}'s game`} className={cn("min-w-0 space-y-2 @min-[56rem]/pg:space-y-2.5 @min-[40rem]/pg:@max-[56rem]/pg:[grid-area:player]", on("player"))} data-testid="post-game-yours" data-own={own || undefined}>
            {/* Who is inspected, and the way back to the profile's player: one line, as tall whoever it is. */}
            <div className="flex min-h-7 items-center gap-2 pointer-coarse:min-h-11" data-testid="inspected">
              <p className="min-w-0 flex-1 truncate text-sm leading-5 @max-[20rem]/pg:whitespace-normal" aria-live="polite">
                <span className="font-semibold text-fg" data-testid="inspected-name">
                  {nameOf(subject)}
                </span>
                <span className="text-fg-muted">
                  {" "}
                  · {champ(subject.championId).name}
                  {position ? ` · ${position}` : ""}
                </span>
              </p>
              {!own ? (
                <button type="button" onClick={() => select(view.player.slot)} className="inline-flex min-h-7 max-w-[50%] shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:min-h-11" data-testid="inspect-back">
                  <Undo2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">Back to {nameOf(view.player)}</span>
                </button>
              ) : null}
            </div>
            <Loadout key={subject.slot} p={subject} champ={champ(subject.championId)} score={<ScoreSummary scores={scores} score={mine} timeline={state} />} />
            <Figures p={subject} teamKills={subjectTeam?.kills ?? 0} />
            <MoreStats p={subject} support={support} />
          </section>
          <div className={cn("min-w-0 space-y-3 @min-[40rem]/pg:@max-[56rem]/pg:[grid-area:side]", on("build"))} data-testid="post-game-side">
            <ParticipantPanels panel={panel} onPanel={setPanel} result={timeline} entry={entry} page={subject.runePage} />
            <Lane view={view} champ={champ} me={subject} entry={entry} state={state} />
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-y-2 @min-[40rem]/pg:@max-[56rem]/pg:contents">
          <section aria-label="Scoreboard" className={cn("min-w-0 space-y-1.5 @min-[40rem]/pg:@max-[56rem]/pg:[grid-area:board]", on("board"))} data-testid="post-game-scoreboard" onKeyDown={onRowKeys}>
            <Scoreboard teams={view.teams} champ={champ} groups={groups} laneSlot={subject.laneOpponentSlot} rankOf={rankOf} queueId={view.queueId} checking={checking} met={met} meetHref={meetHref} selection={{ selected: subject.slot, onSelect: inspect, score: scoreOf, scoring: !timeline, scored: scores?.scored ?? 0 }} />
            {/* One quiet line: the ranks and the possible groups, each with its (i); the date, the bookmark and OP.GG. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-2xs leading-4 text-fg-subtle" data-testid="scoreboard-notes">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ScoreboardNotes ranks={view.teams.flatMap((t) => t.participants.filter((x) => !x.removed).map(rankOf))} queueId={view.queueId} checking={checking} result={ranks} groups={groups} />
              </span>
              {meta}
            </div>
          </section>
          <div className={cn("min-w-0 @min-[40rem]/pg:@max-[56rem]/pg:[grid-area:chart]", on("player"))}>
            <ScoreTimeline scores={scores} points={points} timeline={state} slot={subject.slot} label={nameOf(subject)} />
          </div>
        </div>
      </div>
    </div>
  );
}

const SHORT_QUERY = "(max-height: 480px)";
const subscribeShort = (onChange: () => void) => {
  const q = window.matchMedia(SHORT_QUERY);
  q.addEventListener("change", onChange);
  return () => q.removeEventListener("change", onChange);
};
/** A window under 481px tall (globals.css's `short`), once the page is interactive: false on the server and while hydrating. */
function useShortWindow(): boolean {
  return React.useSyncExternalStore(subscribeShort, () => window.matchMedia(SHORT_QUERY).matches, () => false);
}

/** The nearest ancestor that scrolls vertically (the game's window on a phone), else the page. */
function scrollerOf(el: Element): Element | Window {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const y = getComputedStyle(p).overflowY;
    if ((y === "auto" || y === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return window;
}
