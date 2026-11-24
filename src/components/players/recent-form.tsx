import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { FormMetric, RecentForm } from "@/domain/recent-form";
import { FORM_GAP, FORM_METRIC_GAP, FORM_MIN_GAMES, FORM_MIN_RECENT, FORM_RECENT } from "@/domain/recent-form";
import type { PortraitChampion } from "@/components/champion-portrait";
import { InfoTip } from "@/components/ui/info-tip";
import { ChampionPortrait } from "@/components/champion-portrait";
import { cn } from "@/lib/cn";
import { FitChampions } from "@/components/ui/fit-rows";

/**
 * Recent form's ⓘ, true to recentForm(): the newest FORM_RECENT games against all of them; a trend
 * (and each figure's arrow) only with FORM_MIN_RECENT more games before those and a clear gap.
 */
export const RECENT_FORM_HELP = `The latest ${FORM_RECENT} games against all in this filter. Trends and arrows need ${FORM_MIN_RECENT}+ older games too and a clear gap: ${FORM_GAP}+ win-rate points, ${FORM_METRIC_GAP.kda.relative * 100}% KDA or vision, ${FORM_METRIC_GAP.cs.absolute} CS/min.`;

const fmt = (m: Pick<FormMetric, "key" | "recent">) => (m.recent === null ? "—" : m.recent.toFixed(m.key === "vision" ? 0 : 1));

/**
 * Recent form as a compact card: the last results of the current filter as bars (oldest on the
 * left, newest on the right; a win above the line, a loss below it; the strip opens Match History), the recent win rate beside the whole
 * sample, and the same comparison for KDA and CS/min (vision for supports). "Better lately" /
 * "worse lately" only appear with enough games on both sides. Hidden below five games.
 */
export function RecentFormStrip({ form, championsById, historyHref, narrowed = null, champions = false }: { form: RecentForm; championsById: Record<string, PortraitChampion>; historyHref: string; /** The Refine filters narrowing it, in words (it counts the same games as Season performance). */ narrowed?: string | null; /** List the champions of these games (RecentChampions): only where the Overview has Ranked progress beside it, so its 2×2 applies. */ champions?: boolean }) {
  if (form.season.games < FORM_MIN_GAMES) return null;
  const strip = [...form.last].reverse();
  const wins = strip.filter((g) => g.win).length;
  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const champ = (id: string) => championsById[id] ?? { id, name: id, portraitUrl: "" };
  return (
    <section aria-labelledby="recent-form-title" className="@container flex flex-col gap-2.5 rounded-card border border-border bg-surface p-4 panel-depth" data-testid="recent-form">
      {/* The verdict on the title's row (it was a footer row of its own, a row more on a phone),
          what the bars show on the line under it. */}
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id="recent-form-title" className="text-base font-semibold text-fg">
            Recent form
          </h2>
          <div className="flex items-center gap-1 text-xs" data-testid="recent-form-trend" data-trend={form.trend ?? "none"}>
            {form.trend === "up" ? (
              <span className="inline-flex items-center gap-1 text-good">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Better lately (+{form.gapPoints} pts)
              </span>
            ) : form.trend === "down" ? (
              <span className="inline-flex items-center gap-1 text-bad">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden /> Worse lately ({form.gapPoints} pts)
              </span>
            ) : form.trend === "steady" ? (
              <span className="text-fg-muted">In line with the season</span>
            ) : (
              <span className="text-fg-subtle">Too few games to call a trend</span>
            )}
            <InfoTip label="About recent form" text={RECENT_FORM_HELP} />
          </div>
        </div>
        <p className="text-xs text-fg-subtle">Last {strip.length} · oldest to newest</p>
      </div>
      {narrowed ? (
        <p className="-mt-2 truncate text-xs text-fg-muted" title={`Filtered: ${narrowed}`} data-testid="recent-form-scope">
          Filtered: {narrowed}
        </p>
      ) : null}
      {/* A win rises above the line and a loss hangs below it, so the run reads without its colours too. */}
      {/* The bars share the card's width (up to a fixed size each), over a faint centre line. No
          floor: one in rem grew with the text, and at 175-200% on a 320px phone twenty bars ran up to
          61px past the card and the screen; there they narrow to about 6px instead. */}
      <Link href={historyHref} className="group/strip touch-target relative flex items-center gap-0.5 rounded-sm before:pointer-events-none before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-border/70" aria-label={`Last ${strip.length} games: ${wins} wins, ${strip.length - wins} losses, newest last. Open Match History`} data-testid="recent-form-strip">
        {strip.map((g) => (
          <span key={g.matchId} title={`${g.win ? "Win" : "Loss"} · ${champ(g.championId).name}`} className={cn("relative flex h-8 min-w-0 max-w-3.5 flex-1 flex-col @xl:max-w-5", g.win ? "justify-start" : "justify-end")} data-result={g.win ? "W" : "L"}>
            <span className={cn("h-4 rounded-[3px] transition-opacity duration-150 group-hover/strip:opacity-100", g.win ? "bg-blue opacity-90" : "bg-red opacity-80")} />
          </span>
        ))}
      </Link>
      {/* The card ends at its content (UD.PO2): it was stretched to the season card's height beside
          it, leaving about 90px between the bars and these figures at 1280-1920. */}
      {/* Four across from 18rem of card (a phone at 100% text), each figure's context under it below
          32rem; two by two where four would not hold their figures (a 320px phone at large text). */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm @min-[18rem]:grid-cols-4 @min-[18rem]:gap-x-3" data-testid="recent-form-rates">
        <div>
          <dt className="text-xs text-fg-subtle">Last {form.recent.games}</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">
            {pct(form.recent.winRate)} <span className="text-xs font-normal text-fg-muted @min-[18rem]:@max-lg:block">{form.recent.wins}W {form.recent.games - form.recent.wins}L</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">All {form.season.games}</dt>
          <dd className="text-lg font-semibold tabular-nums text-fg">{pct(form.season.winRate)}</dd>
        </div>
        {form.metrics.map((m) => (
          <div key={m.key} data-testid={`recent-form-${m.key}`} data-direction={m.direction ?? "none"} >
            <dt className="text-xs text-fg-subtle">{m.label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-fg">
              {/* The trend beside the figure, never parted from it, so it shares the figure's line when "vs …" drops to its own. */}
              <span className="whitespace-nowrap">
                {fmt(m)}
                {m.direction === "up" ? <TrendingUp className="ml-1 inline h-3.5 w-3.5 text-good" aria-label="higher lately" /> : m.direction === "down" ? <TrendingDown className="ml-1 inline h-3.5 w-3.5 text-bad" aria-label="lower lately" /> : null}
              </span>
              {m.season !== null ? <span className="text-xs font-normal text-fg-muted @min-[18rem]:@max-lg:block"> vs {fmt({ ...m, recent: m.season })}</span> : null}
              <span className="sr-only">{`: the last ${m.recentGames} games against all ${m.seasonGames}${m.direction === null ? ", too few to compare" : ""}`}</span>
            </dd>
          </div>
        ))}
      </dl>
      {champions ? <RecentChampions last={form.last} champ={champ} /> : null}
    </section>
  );
}

/**
 * How many of the recent games' champions the 2×2's Recent form lists before "and N more" in the
 * server's drawing (Release 16): Recent form is the rail's last card since Ranked progress went above
 * it, so it lists as many as the window's height holds, by the one-screen tiers of globals.css
 * (board-at-*): two under board-at-mid (1440 × 780), three from it (1920 × 950), four from
 * board-at-short (1440 × 900). Once the page is interactive the list shows as many more as fit above
 * the window's bottom (FitChampions, fit-rows.tsx), every champion of the games where there is room.
 */
export const RECENT_CHAMPIONS_SHOWN = 4;
/** Each row's fold in the server's drawing (the "css" mode), by its index: literal classes, for Tailwind. */
const CHAMPION_ROW_FOLD = (i: number) => (i < 2 ? "" : i === 2 ? "group-data-[fit=css]/fit:board-below-mid:hidden" : i === 3 ? "group-data-[fit=css]/fit:board-below-short:hidden" : "group-data-[fit=css]/fit:hidden");

/**
 * The champions of the same recent games, most played first (the newest game breaking a tie), each
 * with its record in them: what the player has been on lately. Only in the Overview's 2×2 (a 1440px
 * window, a 68rem dashboard), where the rail beside the season's card and the pools has the room: it
 * balances the two columns with the card's own data (the UX review of Release 13), where a stretched
 * Ranked progress made small LP moves look large. Neutral, as the rest of Recent form: no win-rate colour.
 * The rest are never hidden without saying so: "and N more" on the heading's line, its count the one
 * shown, and Match History (the strip's link) lists every game.
 */
function RecentChampions({ last, champ }: { last: RecentForm["last"]; champ: (id: string) => PortraitChampion }) {
  const by = new Map<string, { id: string; games: number; wins: number; at: number }>();
  for (const g of last) {
    const c = by.get(g.championId) ?? { id: g.championId, games: 0, wins: 0, at: 0 };
    c.games += 1;
    if (g.win) c.wins += 1;
    c.at = Math.max(c.at, g.at);
    by.set(g.championId, c);
  }
  const rows = [...by.values()].sort((a, b) => b.games - a.games || b.at - a.at);
  // "and N more" in each height until measured: two, three or four rows shown.
  const more = (n: number) => Math.max(0, rows.length - n);
  const counts: Array<[number, string]> = [
    [more(2), "board-at-mid:hidden"],
    [more(3), "hidden board-at-mid:board-below-short:inline"],
    [more(RECENT_CHAMPIONS_SHOWN), "hidden board-at-short:inline"],
  ];
  return (
    <div className="hidden min-[90rem]:@min-[68rem]/ov:block" data-testid="recent-form-champions">
      <FitChampions
        total={rows.length}
        heading={<h3 className="label-caps">Champions in these games</h3>}
        cssMore={
          more(2) ? (
            <p className="text-xs text-fg-subtle" data-testid="recent-form-champions-more">
              {counts.map(([n, cls], i) => (n ? <span key={i} className={cls}>and {n} more</span> : null))}
            </p>
          ) : null
        }
      >
        <ul className="mt-1.5 divide-y divide-border/60">
          {rows.map((c, i) => (
            <li key={c.id} className={cn("flex min-w-0 items-center gap-2.5 py-1", CHAMPION_ROW_FOLD(i))} data-champion={c.id} data-ov-rank={i + 1}>
              <span aria-hidden className="inline-flex">
                <ChampionPortrait champion={champ(c.id)} size="xs" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{champ(c.id).name}</span>
              <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                {c.games} {c.games === 1 ? "game" : "games"} · {c.wins}W {c.games - c.wins}L
              </span>
            </li>
          ))}
        </ul>
      </FitChampions>
    </div>
  );
}
