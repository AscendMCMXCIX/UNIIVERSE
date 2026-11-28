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
import { ScoreSummary } from "./performance-panel";
import { usePhone } from "@/components/ui/use-phone";
import { segmentClass, segmentedGroupClass } from "@/components/ui/segmented";
import { finalScoresOf } from "@/domain/performance-inputs";
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
    groups, ordered by role; Build Path | Skill Order | Runes over one area, one height per game; the lane
    by role against the lane opponent at 10:00, 15:00 and the end.
  - The scoreboard: both teams as one component, every player's score and place in their row; its
    quiet notes under it (ranks and possible groups, each with its (i), the date, the bookmark and
    OP.GG; from 56rem beside the lane). The score through the game under it was removed at the owner's request of 25 Nov 2026;
    its room went to the scoreboard's rows, the player's own score, the lane (from 56rem under the
    scoreboard, where the chart was) and the build panels, which take the height the scoreboard and
    the lane leave beside them, so a long build path needs fewer pages and the columns end level.
  Every part above the scoreboard and beside it keeps its height whoever is inspected, so the rows
  never move as another player is chosen. Widths (the view's own, @container/pg; VIEW_GRID): from
  56rem two columns (the player over the build panels, the scoreboard over the lane); 40–56rem the
  player beside the build panels and the lane, the scoreboard under both; under 40rem one column. A phone's window shows one of three pages at a
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
    // One row; under 19rem (a phone at large text, where the row ran 145px past the screen) the
    // inventory, then the score, move to the next line whole: nothing runs past the screen.
    <div className="flex items-center gap-x-2.5 gap-y-2 @max-[19rem]/pg:flex-wrap" data-testid="post-game-loadout">
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
      {/* Under 19rem as wide as the score needs, never narrower (so it moves down whole rather than squeeze); the name line takes no width of its own. */}
      <span className="flex h-14 min-w-0 flex-1 flex-col items-end justify-between @max-[19rem]/pg:min-w-fit">
        {score}
        <span className="block h-4 w-0 min-w-full truncate text-right text-xs leading-4 text-fg-muted" aria-hidden data-testid="loadout-name">
          {name ?? ""}
        </span>
      </span>
    </div>
  );
}

/** From a 56rem view (two columns) the figures and the other figures a step larger: the room the score through the game left (25 Nov 2026). */
function Figure({ label, value, sub, testId }: { label: string; value: string; sub: string | null; testId: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="label-text leading-4 [overflow-wrap:anywhere]">{label}</div>
      <div className="text-base font-semibold leading-5 tabular-nums text-fg @min-[56rem]/pg:text-lg @min-[56rem]/pg:leading-6">{value}</div>
      <div className="text-xs leading-4 tabular-nums text-fg-muted">{sub ?? " "}</div>
    </div>
  );
}

/** Six figures, each of the player's figures once in the whole view: no card each, a grid of aligned columns. */
function Figures({ p, teamKills }: { p: DetailParticipant; teamKills: number }) {
  return (
    // Six across where the player's part is at least 37rem wide (a tablet's one column), else three by
    // two; two by three under 19rem (a phone at large text), where three across cut the figures short.
    // Nothing is shortened with an ellipsis: a word that does not fit wraps.
    <div className="@container/fig">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1 @max-[19rem]/fig:grid-cols-2 @min-[37rem]/fig:grid-cols-6" data-testid="post-game-figures">
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
    // Three groups side by side; one under another under 19rem (a phone at large text), where three
    // columns cut their names short. Nothing is shortened with an ellipsis: a name that does not fit wraps.
    <div className="@container/more">
    <div className="grid grid-cols-3 gap-x-3 @max-[19rem]/more:grid-cols-1 @max-[19rem]/more:gap-y-1" data-testid="post-game-more" data-order={order.join(" ")}>
      {order.map((k) => {
        const g = groups[k];
        return (
          <section key={k} aria-label={g.label} className="min-w-0" data-testid={`more-${k}`}>
            <p className="label-text leading-4 [overflow-wrap:anywhere]" aria-hidden>
              {g.label}
            </p>
            <dl className="text-2xs leading-4 @min-[56rem]/pg:text-xs @min-[56rem]/pg:leading-5">
              {g.rows.map(([key, label, value, spoken]) => (
                <div key={key} className="flex items-baseline justify-between gap-1.5" data-testid={`more-${key}`}>
                  <dt className="min-w-0 text-fg-muted">
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
        <p className="label-text leading-5">Lane</p>
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
          <tr className="label-text">
            <th className="text-left font-medium">
              <span className="flex items-center gap-1.5">
                Lane vs
                <ChampionPortrait champion={c} size="xs" className="h-4 w-4 rounded" />
                <span className="truncate text-xs font-semibold text-fg">{c.name}</span>
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

/*
  The view's grid, by its own width (@container/pg). Its four parts are its own items, in reading
  order: the player inspected, the build panels (Build Path | Skill Order | Runes), the lane and the
  scoreboard, then its notes (the ranks and the possible groups with their (i), the date, the
  bookmark and OP.GG). Under 40rem one column in that order (a phone's pages show one or two of
  them). 40–56rem (a tablet): the player beside the build panels with the lane under them, the
  scoreboard and its notes across under both; the lane's row takes what the player's column has
  left (1fr), so nothing opens between the panels and the lane. From 56rem two columns: the player
  over the build panels, the scoreboard over the lane with its notes beside the lane, right-aligned
  (since 26 Nov 2026: the room the score through the game left under the scoreboard; the notes beside
  the lane rather than over it keep the column no taller than the chart left it, so the game still
  fits 1280 × 720 with a scoreboard of long names and possible groups); the build panels' row is the
  flexible one, so they take whatever height the scoreboard and the lane leave beside them (the
  build path's pages hold more rows) and the two columns end level.
*/
const VIEW_GRID = cn(
  "grid gap-x-5 gap-y-3",
  "@min-[40rem]/pg:@max-[56rem]/pg:grid-cols-2 @min-[40rem]/pg:@max-[56rem]/pg:grid-rows-[auto_1fr_auto_auto] @min-[40rem]/pg:@max-[56rem]/pg:[grid-template-areas:'player_side'_'player_lane'_'board_board'_'notes_notes']",
  "@min-[56rem]/pg:grid-cols-[minmax(0,22rem)_21rem_minmax(0,1fr)] @min-[56rem]/pg:grid-rows-[auto_auto_1fr] @min-[56rem]/pg:[grid-template-areas:'player_board_board'_'side_board_board'_'side_lane_notes'] @min-[64rem]/pg:grid-cols-[minmax(0,24rem)_21rem_minmax(0,1fr)] @min-[80rem]/pg:grid-cols-[minmax(0,27rem)_21rem_minmax(0,1fr)]",
);

type PhonePage = "player" | "build" | "board";
const PHONE_PAGES: Array<{ key: PhonePage; label: string }> = [
  { key: "player", label: "Player" },
  { key: "build", label: "Build" },
  { key: "board", label: "Scoreboard" },
];
/**
 * A desktop's game window paged by measure (fitPages: the workspace's floor) is wide: the player and their build share the
 * first page side by side (the player, the build panels beside it, the lane under the player), the scoreboard the second.
 */
const FIT_PAGES: Array<{ key: PhonePage; label: string }> = [
  { key: "player", label: "Player and build" },
  { key: "board", label: "Scoreboard" },
];

/**
 * The grid areas of the view's parts from 40rem (VIEW_GRID's), literal for Tailwind. A view paged by its
 * measure (`fitPages`: a desktop's game window too short for it) leaves them out: each page's parts then
 * sit in a plain two-column grid (the player alone; the build panels beside the lane; the scoreboard over
 * its notes across both), never in the empty areas of the parts on the other pages.
 */
const AREA = { player: "@min-[40rem]/pg:[grid-area:player]", side: "@min-[40rem]/pg:[grid-area:side]", lane: "@min-[40rem]/pg:[grid-area:lane]", board: "@min-[40rem]/pg:[grid-area:board]", notes: "@min-[40rem]/pg:[grid-area:notes]" } as const;
const FIT_PAGED_GRID = "grid gap-x-5 gap-y-3 @min-[40rem]/pg:grid-cols-2";
const SPAN_BOTH = "@min-[40rem]/pg:col-span-2";
/** Paged by measure: the build panels beside the player and the lane under it (two rows of the second column). */
const SIDE_BESIDE = "@min-[40rem]/pg:row-span-2";

/**
 * Whether a view taller than the room it is given (its parent: the game window's fixed-height body) must
 * show its pages (pure, for its unit test): unpaged, when it is taller than the room; paged, until the room
 * grows past the height it had when the view went to its pages, or changes width (the view's layout
 * follows its width), when it is measured whole again.
 */
export function fitPagesNext(paged: boolean, m: { view: number; room: number; roomWidth: number; at: { room: number; width: number } | null }): boolean {
  if (!paged) return m.view > m.room + 0.5;
  if (!m.at) return true;
  return !(m.room > m.at.room + 0.5 || Math.abs(m.roomWidth - m.at.width) > 0.5);
}

/**
 * Pages by measure (`fitPages`: the workspace's game window, a fixed height with nothing scrolling inside):
 * the view drawn whole while it fits its parent, its three pages (Player, Build, Scoreboard) where it does
 * not (a game with a long build path or long names at 1366 × 657, the workspace's floor). Measured as it
 * is drawn and as its parts arrive (the timeline, the groups, the ranks), and again when the room changes.
 */
function useFitPages(enabled: boolean, rootRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [paged, setPaged] = React.useState(false);
  const at = React.useRef<{ room: number; width: number } | null>(null);
  const pagedRef = React.useRef(paged);
  React.useLayoutEffect(() => {
    pagedRef.current = paged;
  });
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const room = root?.parentElement;
    if (!enabled || !root || !room) return;
    const check = () => {
      const m = { view: root.getBoundingClientRect().height, room: room.clientHeight, roomWidth: room.clientWidth, at: at.current };
      const next = fitPagesNext(pagedRef.current, m);
      if (next === pagedRef.current) return;
      at.current = next ? { room: m.room, width: m.roomWidth } : null;
      pagedRef.current = next;
      setPaged(next);
    };
    check();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(check) : null;
    ro?.observe(root);
    ro?.observe(room);
    return () => ro?.disconnect();
  }, [enabled, rootRef]);
  return enabled && paged;
}

export function PostGame({ playerId, view, champ, variant, encounterLinks = false, fitPages = false }: { playerId: string; view: MatchDetailView; champ: (id: string | null) => PortraitChampion; variant: "inline" | "window"; /** A window over the list itself (a phone's whole-screen game, a desktop's workspace window): its marks may lead to the list's Encounters, as under a card. */ encounterLinks?: boolean; /** A window of a fixed height (the workspace's game window): its pages where the view does not fit its parent (useFitPages). */ fitPages?: boolean }) {
  const cache = React.useContext(MatchDetailCacheContext);
  const id = view.matchId;
  // The timeline first (the lane, the build path, the skill order and the scores' lane read it), then the possible groups, the rank check and the players met, each after the view is on screen.
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
  const rootRef = React.useRef<HTMLDivElement>(null);
  const fitPaged = useFitPages(fitPages && variant === "window" && !phone && !short, rootRef);
  const paged = ((phone || short) && variant === "window") || fitPaged;
  const [page, setPage] = React.useState<PhonePage>("player");
  const all = React.useMemo(() => view.teams.flatMap((t) => t.participants), [view.teams]);
  const subject = all.find((p) => p.slot === selected && !p.removed) ?? view.player;
  const entry = tl?.players.find((p) => p.slot === subject.slot) ?? null;
  // The final scores, once the timeline has answered (its lane at 10:00 and 15:00 is one of their figures), from what is loaded: the card's own calculation (finalScoresOf).
  const scores = React.useMemo(() => (timeline ? finalScoresOf(view, tl) : null), [timeline, tl, view]);
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
  // Paged by measure, the build's parts are the first page's (FIT_PAGES).
  const on = (p: PhonePage) => (paged && page !== (fitPaged && p === "build" ? "player" : p) ? "hidden" : undefined);
  const pages = fitPaged ? FIT_PAGES : PHONE_PAGES;
  const meta = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden" data-testid="post-game-meta">
      {/* The date and the patch each kept whole: a narrow line (the notes beside the lane) breaks between them. */}
      <span className={cn("tabular-nums", variant === "window" && "hidden")} data-testid="match-breakdown-when">
        <span className="whitespace-nowrap">{formatDateTime(new Date(view.playedAt))}</span>
        {view.patch ? <span className="whitespace-nowrap">{` · Patch ${publicPatchName(view.patch)}`}</span> : null}
      </span>
      {view.share.eligible ? <BookmarkButton matchId={view.matchId} bookmarked={view.share.shared} share /> : null}
      {view.player.opgg ? <OpggHistoryLink href={view.player.opgg} account={view.player.name?.split("#")[0]?.trim() || null} /> : null}
    </span>
  );
  return (
    <div ref={rootRef} className="@container/pg [overflow-anchor:none]" data-testid="match-breakdown" data-variant={variant} data-met={meetings ? (meetings.status === "ok" ? meetings.players.length : 0) : undefined} data-timeline={timeline ? timeline.status : "loading"} data-selected={subject.slot} data-paged={paged || undefined} data-paged-by={fitPaged ? "measure" : undefined} data-page={paged ? page : undefined}>
      {paged ? (
        <div role="radiogroup" aria-label="Show the player, the build or the scoreboard" className={segmentedGroupClass(cn("mb-2.5 flex w-full flex-wrap [&>*]:flex-1", fitPaged && "@min-[40rem]/pg:w-fit"))} data-testid="post-game-pages">
          {pages.map((p) => (
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
                const next = pages[(pages.findIndex((x) => x.key === p.key) + step + pages.length) % pages.length]!;
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
      {/* The player, the build panels, the lane and the scoreboard, placed by VIEW_GRID. */}
      <div className={fitPaged ? FIT_PAGED_GRID : VIEW_GRID}>
        <section aria-label={own && view.own ? "Your game" : `${nameOf(subject)}'s game`} className={cn("min-w-0 space-y-2 self-start @min-[56rem]/pg:space-y-2.5", !fitPaged && AREA.player, on("player"))} data-testid="post-game-yours" data-own={own || undefined}>
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
        {/* The build panels fill their grid area: from 56rem the height the scoreboard and the lane leave beside them. */}
        <div className={cn("min-w-0 flex-col", fitPaged ? SIDE_BESIDE : AREA.side, on("build") ?? "flex")} data-testid="post-game-side">
          <ParticipantPanels panel={panel} onPanel={setPanel} result={timeline} entry={entry} page={subject.runePage} />
        </div>
        <div className={cn("min-w-0 self-start", !fitPaged && AREA.lane, on("build"))}>
          <Lane view={view} champ={champ} me={subject} entry={entry} state={state} />
        </div>
        <section aria-label="Scoreboard" className={cn("min-w-0 self-start", fitPaged ? SPAN_BOTH : AREA.board, on("board"))} data-testid="post-game-scoreboard" onKeyDown={onRowKeys}>
          <Scoreboard teams={view.teams} champ={champ} groups={groups} laneSlot={subject.laneOpponentSlot} rankOf={rankOf} queueId={view.queueId} checking={checking} met={met} meetHref={meetHref} selection={{ selected: subject.slot, onSelect: inspect, score: scoreOf, scoring: !timeline, scored: scores?.scored ?? 0 }} />
        </section>
        {/* The scoreboard's quiet notes: the ranks and the possible groups, each with its (i); the date, the bookmark and OP.GG.
            One line 6px under the scoreboard (the grid's 12px gap less 6px); from 56rem beside the lane, right-aligned, wrapping in its cell. */}
        <div className={cn("-mt-1.5 min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-2xs leading-4 text-fg-subtle @min-[56rem]/pg:mt-0 @min-[56rem]/pg:flex-col @min-[56rem]/pg:items-end @min-[56rem]/pg:justify-start @min-[56rem]/pg:self-start @min-[56rem]/pg:text-right @min-[56rem]/pg:[&>span]:justify-end", fitPaged ? SPAN_BOTH : AREA.notes, on("board") ?? "flex")} data-testid="scoreboard-notes">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ScoreboardNotes ranks={view.teams.flatMap((t) => t.participants.filter((x) => !x.removed).map(rankOf))} queueId={view.queueId} checking={checking} result={ranks} groups={groups} />
          </span>
          {meta}
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
