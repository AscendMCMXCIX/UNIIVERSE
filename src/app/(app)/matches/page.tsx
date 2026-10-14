import Link from "next/link";
import { COMPETITION_MODES, competitionModeLabel, isCompetitionMode } from "@/domain/competition";
import { ROLES } from "@/domain/roles";
import { canStartNextGame, describeSeries, seriesLabel } from "@/domain/series";
import { getAppDb } from "@/server/bootstrap";
import { hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { listChampions } from "@/server/repositories/champions";
import { ChampionFilter } from "@/components/champions/champion-filter";
import { getBranding } from "@/server/repositories/branding";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listPlayers } from "@/server/repositories/team";
import { listMatches, matchFilterOptions, matchSummary, type MatchResult, type MatchRow } from "@/server/matches/repository";
import { listSeries, type SeriesRecord } from "@/server/series/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { SeriesControls } from "@/components/matches/series-controls";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MatchActions } from "@/components/matches/match-actions";
import { inArray } from "drizzle-orm";
import { drafts } from "@/server/db/schema";
import { Panel, PanelBody } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

type Group = { kind: "series"; series: SeriesRecord; games: MatchRow[] } | { kind: "single"; match: MatchRow };

/** Newest first; games of one series stay together under their series header. */
function groupMatches(rows: MatchRow[], seriesById: Map<string, SeriesRecord>): Group[] {
  const groups: Group[] = [];
  const seen = new Map<string, Group & { kind: "series" }>();
  for (const m of rows) {
    const s = m.seriesId ? seriesById.get(m.seriesId) : null;
    if (!s) {
      groups.push({ kind: "single", match: m });
      continue;
    }
    let g = seen.get(s.id);
    if (!g) {
      g = { kind: "series", series: s, games: [] };
      seen.set(s.id, g);
      groups.push(g);
    }
    g.games.push(m);
  }
  for (const g of groups) if (g.kind === "series") g.games.sort((a, b) => a.gameNumber - b.gameNumber);
  return groups;
}

/** Match archive: a record per completed game, grouped by series. Never used to train anything. */
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = await getAppDb();
  const [team, session, branding] = await Promise.all([getOrCreateTeam(db), requirePageAccess("view-matches"), getBranding(db)]);
  const mode = str(sp.mode);
  const result = str(sp.result);
  const filters = {
    mode: isCompetitionMode(mode) ? mode : null,
    result: result === "win" || result === "loss" || result === "cancelled" || result === "none" ? (result as MatchResult | "none") : null,
    opponentName: str(sp.opponent) || null,
    patch: str(sp.patch) || null,
    championId: str(sp.champion) || null,
    playerId: str(sp.player) || null,
  };
  const limit = Math.min(500, Math.max(20, Number(str(sp.limit)) || 60));
  const [rowsPlus, champions, options, summary, players, allSeries] = await Promise.all([listMatches(db, team.id, { ...filters, limit: limit + 1 }), listChampions(db), matchFilterOptions(db, team.id), matchSummary(db, team.id), listPlayers(db, team.id), listSeries(db, team.id)]);
  const hasMore = rowsPlus.length > limit;
  const rows = rowsPlus.slice(0, limit);
  const moreHref = `/matches?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === "string" && v)), limit: String(limit + 60) } as Record<string, string>).toString()}`;
  const seriesById = new Map(allSeries.map((s) => [s.id, s]));
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string | null) => (id ? byId.get(id) ?? { id, name: id, portraitUrl: "" } : null);
  const active = Object.values(filters).some(Boolean);
  const canEdit = hasPermission(session, "manage-matches");
  const groups = groupMatches(rows, seriesById);

  // Who may edit which record: the draft's creator, or anyone allowed to manage every match.
  const draftIds = rows.map((m) => m.draftId).filter((id): id is string => !!id);
  const creators = draftIds.length ? await db.select({ id: drafts.id, createdByUserId: drafts.createdByUserId }).from(drafts).where(inArray(drafts.id, draftIds)) : [];
  const creatorOf = new Map(creators.map((d) => [d.id, d.createdByUserId]));
  const canEditMatch = (m: MatchRow) => canEdit || (!!m.draftId && !!session.userId && creatorOf.get(m.draftId) === session.userId);

  const gameCard = (m: MatchRow, inSeries: boolean) => {
    const picks = [...m.ourPicks].sort((a, b) => ROLES.indexOf(a.role ?? "TOP") - ROLES.indexOf(b.role ?? "TOP"));
    const title = inSeries ? `Game ${m.gameNumber}` : m.opponentName ? `vs ${m.opponentName}` : competitionModeLabel(m.mode);
    const resultTone = m.result === "win" ? "bg-good" : m.result === "loss" ? "bg-bad" : "bg-border-strong";
    return (
      <li key={m.id} className="relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-surface p-3 pl-5 transition-colors hover:border-border-strong sm:flex-row sm:items-center sm:gap-4" data-testid="match-card">
        <span className={`absolute inset-y-0 left-0 w-1.5 ${resultTone}`} aria-hidden />
        <div className="min-w-0 sm:w-56">
          <div className="flex items-center gap-2">
            <span className={m.result === "win" ? "text-sm font-bold text-good" : m.result === "loss" ? "text-sm font-bold text-bad" : "text-sm font-semibold text-fg-muted"}>{m.result === "win" ? "Victory" : m.result === "loss" ? "Defeat" : m.result === "cancelled" ? "Cancelled" : "No result"}</span>
            <span className="truncate text-sm font-semibold text-fg">{title}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
            <span>{formatDate(m.playedAt)}</span>
            {!inSeries ? <Badge tone="neutral">{competitionModeLabel(m.mode)}</Badge> : null}
            <Badge tone={m.side === "blue" ? "blue" : "red"}>{m.side === "blue" ? "Blue side" : "Red side"}</Badge>
            {m.durationSeconds ? <span>{Math.round(m.durationSeconds / 60)} min</span> : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-1">
            {picks.map((p) => (
              <ChampionPortrait key={p.index} champion={champ(p.championId)} size="sm" />
            ))}
          </div>
          <span className="text-xs font-semibold text-fg-subtle">VS</span>
          <div className="flex items-center gap-1">
            {m.enemyPicks.map((p) => (
              <ChampionPortrait key={p.index} champion={champ(p.championId)} size="sm" className="opacity-75" />
            ))}
          </div>
        </div>
        <MatchActions matchId={m.id} label={inSeries ? `game ${m.gameNumber}` : title} canEdit={canEditMatch(m)} />
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Matches" description={`${summary.total} game${summary.total === 1 ? "" : "s"} · ${summary.wins}W ${summary.losses}L recorded. Every completed draft is kept here with its playbook.`} />

      <details className="group rounded-xl border border-border bg-surface" open={active}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-fg-muted hover:text-fg">
          <span>
            Filters{active ? ` · ${Object.values(filters).filter(Boolean).length} active` : ""}
          </span>
          <span className="text-xs font-normal text-fg-subtle group-open:hidden">Show</span>
          <span className="hidden text-xs font-normal text-fg-subtle group-open:inline">Hide</span>
        </summary>
        <form method="get" className="grid grid-cols-2 items-end gap-3 border-t border-border p-4 text-xs sm:flex sm:flex-wrap">
          <Select name="mode" label="Competition" value={mode} options={COMPETITION_MODES.map((m) => [m, competitionModeLabel(m)])} />
          <Select name="result" label="Result" value={result} options={[["win", "Win"], ["loss", "Loss"], ["cancelled", "Cancelled"], ["none", "No result"]]} />
          <Select name="opponent" label="Opponent" value={filters.opponentName ?? ""} options={options.opponents.map((o) => [o, o])} />
          <Select name="patch" label="Patch" value={filters.patch ?? ""} options={options.patches.map((p) => [p, p])} />
          <Select name="player" label="Player" value={filters.playerId ?? ""} options={players.map((p) => [p.id, p.displayName])} />
          <div className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1 sm:w-52">
            <span className="text-fg-subtle">Our champion</span>
            <ChampionFilter name="champion" label="Our champion" value={filters.championId ? { scope: "champion", championId: filters.championId } : { scope: "all" }} champions={champions.map((c) => ({ id: c.id, name: c.name, portraitUrl: c.portraitUrl }))} testId="matches-champion" />
          </div>
          <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            {active ? (
              <Link href="/matches" className="text-fg-subtle hover:text-fg">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </details>

      {rows.length === 0 ? <Panel><PanelBody className="text-sm text-fg-muted">{active ? "No matches fit these filters." : "No matches yet. Finish a draft (not a theorycraft one) and it appears here."}</PanelBody></Panel> : null}
      <div className="space-y-4" data-testid="match-history">
        {groups.map((g) =>
          g.kind === "single" ? (
            <ul key={g.match.id}>{gameCard(g.match, false)}</ul>
          ) : (
            <section key={g.series.id} className="space-y-2 rounded-2xl border border-border bg-bg-elevated/60 p-3">
              <header className="flex flex-wrap items-center gap-3 px-1">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {competitionModeLabel(g.series.mode)}
                    {g.series.eventName ? ` — ${g.series.eventName}` : ""} · {branding.shortName} vs {g.series.opponentName || "Unnamed opponent"}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {seriesLabel(g.series.bestOf)} · {describeSeries({ ...g.series, ourName: branding.shortName, theirName: g.series.opponentName })} · {formatDate(g.series.createdAt)}
                  </div>
                </div>
                <Badge tone={g.series.status === "completed" ? (g.series.winner === "us" ? "good" : "bad") : g.series.status === "cancelled" ? "neutral" : "info"}>{g.series.status === "in_progress" ? "In progress" : g.series.status === "completed" ? (g.series.winner === "us" ? "Won" : "Lost") : "Cancelled"}</Badge>
                <span className="flex-1" />
                <SeriesControls seriesId={g.series.id} status={g.series.status} canStartNext={canStartNextGame(g.series)} canEdit={canEdit} />
              </header>
              <ul className="space-y-2">{g.games.map((m) => gameCard(m, true))}</ul>
            </section>
          ),
        )}
      </div>
      {hasMore ? (
        <Link href={moreHref} className={buttonClass("outline", "md", "w-full")}>
          Load more (newest {limit} shown)
        </Link>
      ) : null}
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-fg-subtle">{label}</span>
      <select name={name} defaultValue={value} className="h-11 w-full min-w-0 rounded-md border border-border bg-bg-elevated px-2 text-base sm:max-w-[180px] md:h-8 md:text-xs">
        <option value="">any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
