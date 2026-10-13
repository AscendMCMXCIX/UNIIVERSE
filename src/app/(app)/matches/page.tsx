import Link from "next/link";
import { COMPETITION_MODES, competitionModeLabel, isCompetitionMode } from "@/domain/competition";
import { ROLES } from "@/domain/roles";
import { canStartNextGame, describeSeries, seriesLabel } from "@/domain/series";
import { getAppDb } from "@/server/bootstrap";
import { getSession, hasPermission } from "@/server/auth/session";
import { listChampions } from "@/server/repositories/champions";
import { getBranding } from "@/server/repositories/branding";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listPlayers } from "@/server/repositories/team";
import { listMatches, matchFilterOptions, matchSummary, type MatchResult, type MatchRow } from "@/server/matches/repository";
import { listSeries, type SeriesRecord } from "@/server/series/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { SeriesControls } from "@/components/matches/series-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
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
  const [team, session, branding] = await Promise.all([getOrCreateTeam(db), getSession(), getBranding(db)]);
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

  const gameRow = (m: MatchRow, inSeries: boolean) => {
    const picks = [...m.ourPicks].sort((a, b) => ROLES.indexOf(a.role ?? "TOP") - ROLES.indexOf(b.role ?? "TOP"));
    return (
      <Link key={m.id} href={`/matches/${m.id}`} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 hover:bg-surface-2 sm:px-4 ${inSeries ? "pl-6 sm:pl-8" : ""}`}>
        <div className="w-full min-w-0 sm:w-44">
          <div className="truncate text-sm font-semibold">{inSeries ? `Game ${m.gameNumber}` : m.opponentName || "Unnamed opponent"}</div>
          <div className="text-xs text-fg-subtle">
            {formatDate(m.playedAt)} · patch {m.patch}
            {!inSeries && m.eventName ? ` · ${m.eventName}` : ""}
          </div>
        </div>
        {!inSeries ? <Badge tone="neutral">{competitionModeLabel(m.mode)}</Badge> : null}
        <Badge tone={m.side === "blue" ? "blue" : "red"}>{m.side}</Badge>
        <Badge tone={m.result === "win" ? "good" : m.result === "loss" ? "bad" : "neutral"}>{m.result ?? "no result"}</Badge>
        {m.durationSeconds ? <span className="text-xs text-fg-subtle">{Math.round(m.durationSeconds / 60)} min</span> : null}
        <div className="flex items-center gap-1">
          {picks.map((p) => (
            <ChampionPortrait key={p.index} champion={champ(p.championId)} size="xs" />
          ))}
        </div>
        <span className="text-xs text-fg-subtle">vs</span>
        <div className="flex items-center gap-1">
          {m.enemyPicks.map((p) => (
            <ChampionPortrait key={p.index} champion={champ(p.championId)} size="xs" dimmed />
          ))}
        </div>
        {m.riotMatchId ? <Badge tone="info">riot</Badge> : null}
        {m.vodUrl ? <Badge tone="accent">vod</Badge> : null}
        {m.notes ? <span className="truncate text-xs text-fg-subtle">“{m.notes.slice(0, 60)}”</span> : null}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-xl font-bold">Matches</h1>
          <p className="text-sm text-fg-muted">
            Every completed draft is archived here. {summary.total} record{summary.total === 1 ? "" : "s"} · {summary.wins}W {summary.losses}L recorded. Results and notes are for looking back, not for the engine.
          </p>
        </div>
      </div>

      <Panel>
        <PanelHeader title="FILTERS" />
        <PanelBody>
          <form method="get" className="grid grid-cols-2 items-end gap-2 text-xs sm:flex sm:flex-wrap">
            <Select name="mode" label="Mode" value={mode} options={COMPETITION_MODES.map((m) => [m, competitionModeLabel(m)])} />
            <Select name="result" label="Result" value={result} options={[["win", "Win"], ["loss", "Loss"], ["cancelled", "Cancelled"], ["none", "No result"]]} />
            <Select name="opponent" label="Opponent" value={filters.opponentName ?? ""} options={options.opponents.map((o) => [o, o])} />
            <Select name="patch" label="Patch" value={filters.patch ?? ""} options={options.patches.map((p) => [p, p])} />
            <Select name="player" label="Player" value={filters.playerId ?? ""} options={players.map((p) => [p.id, p.displayName])} />
            <Select name="champion" label="Our champion" value={filters.championId ?? ""} options={champions.map((c) => [c.id, c.name])} />
            <div className="col-span-2 flex items-center gap-3 sm:col-span-1">
              <Button type="submit" size="sm" variant="outline">
                Apply
              </Button>
              {active ? (
                <Link href="/matches" className="text-fg-subtle hover:text-fg">
                  clear
                </Link>
              ) : null}
            </div>
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="MATCH HISTORY" subtitle={`${rows.length} game${rows.length === 1 ? "" : "s"} shown`} />
        <PanelBody className="divide-y divide-border p-0">
          {rows.length === 0 ? <p className="px-4 py-3 text-sm text-fg-muted">{active ? "No matches match these filters." : "No matches yet. Finish a draft (not a theorycraft one) and it appears here."}</p> : null}
          {hasMore ? (
            <Link href={moreHref} className="block px-4 py-3 text-center text-xs text-accent hover:underline">
              Show more (newest {limit} shown)
            </Link>
          ) : null}
          {groups.map((g) =>
            g.kind === "single" ? (
              gameRow(g.match, false)
            ) : (
              <div key={g.series.id} className="divide-y divide-border/60">
                <div className="flex flex-wrap items-center gap-3 bg-bg-elevated/60 px-3 py-2.5 sm:px-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {competitionModeLabel(g.series.mode)}
                      {g.series.eventName ? ` — ${g.series.eventName}` : ""} · {branding.shortName} vs {g.series.opponentName || "Unnamed opponent"}
                    </div>
                    <div className="text-xs text-fg-subtle">
                      {seriesLabel(g.series.bestOf)} · {describeSeries({ ...g.series, ourName: branding.shortName, theirName: g.series.opponentName })} · {formatDate(g.series.createdAt)}
                    </div>
                  </div>
                  <Badge tone={g.series.status === "completed" ? (g.series.winner === "us" ? "good" : "bad") : g.series.status === "cancelled" ? "neutral" : "info"}>{g.series.status === "in_progress" ? "in progress" : g.series.status}</Badge>
                  <span className="flex-1" />
                  <SeriesControls seriesId={g.series.id} status={g.series.status} canStartNext={canStartNextGame(g.series)} canEdit={canEdit} />
                </div>
                {g.games.map((m) => gameRow(m, true))}
              </div>
            ),
          )}
        </PanelBody>
      </Panel>
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
