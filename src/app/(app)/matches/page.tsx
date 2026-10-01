import Link from "next/link";
import { COMPETITION_MODES, competitionModeLabel, isCompetitionMode } from "@/domain/competition";
import { ROLES } from "@/domain/roles";
import { getAppDb } from "@/server/bootstrap";
import { listChampions } from "@/server/repositories/champions";
import { getOrCreateTeam } from "@/server/repositories/team";
import { listPlayers } from "@/server/repositories/team";
import { listMatches, matchFilterOptions, matchSummary, type MatchResult } from "@/server/matches/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Match archive: a record per completed draft, with optional results and notes. Never used to train anything. */
export default async function MatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const db = await getAppDb();
  const team = await getOrCreateTeam(db);
  const mode = str(sp.mode);
  const result = str(sp.result);
  const filters = {
    mode: isCompetitionMode(mode) ? mode : null,
    result: result === "win" || result === "loss" || result === "cancelled" || result === "none" ? (result as MatchResult | "none") : null,
    opponentTeamId: str(sp.opponent) || null,
    patch: str(sp.patch) || null,
    championId: str(sp.champion) || null,
    playerId: str(sp.player) || null,
  };
  const [rows, champions, options, summary, players] = await Promise.all([listMatches(db, team.id, filters), listChampions(db), matchFilterOptions(db, team.id), matchSummary(db, team.id), listPlayers(db, team.id)]);
  const byId = new Map(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (id: string | null) => (id ? byId.get(id) ?? { id, name: id, portraitUrl: "" } : null);
  const active = Object.values(filters).some(Boolean);

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
          <form method="get" className="flex flex-wrap items-end gap-2 text-xs">
            <Select name="mode" label="Mode" value={mode} options={COMPETITION_MODES.map((m) => [m, competitionModeLabel(m)])} />
            <Select name="result" label="Result" value={result} options={[["win", "Win"], ["loss", "Loss"], ["cancelled", "Cancelled"], ["none", "No result"]]} />
            <Select name="opponent" label="Opponent" value={filters.opponentTeamId ?? ""} options={options.opponents.map((o) => [o.id, o.name])} />
            <Select name="patch" label="Patch" value={filters.patch ?? ""} options={options.patches.map((p) => [p, p])} />
            <Select name="player" label="Player" value={filters.playerId ?? ""} options={players.map((p) => [p.id, p.displayName])} />
            <Select name="champion" label="Our champion" value={filters.championId ?? ""} options={champions.map((c) => [c.id, c.name])} />
            <Button type="submit" size="sm" variant="outline">
              Apply
            </Button>
            {active ? (
              <Link href="/matches" className="text-fg-subtle hover:text-fg">
                clear
              </Link>
            ) : null}
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="MATCH HISTORY" subtitle={`${rows.length} shown`} />
        <PanelBody className="divide-y divide-border p-0">
          {rows.length === 0 ? <p className="px-4 py-3 text-sm text-fg-muted">{active ? "No matches match these filters." : "No matches yet. Finish a draft (not a theorycraft one) and it appears here."}</p> : null}
          {rows.map((m) => {
            const picks = [...m.ourPicks].sort((a, b) => ROLES.indexOf(a.role ?? "TOP") - ROLES.indexOf(b.role ?? "TOP"));
            return (
              <Link key={m.id} href={`/matches/${m.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="w-44 min-w-0">
                  <div className="truncate text-sm font-semibold">{m.opponentName || "Unnamed opponent"}</div>
                  <div className="text-xs text-fg-subtle">
                    {formatDate(m.playedAt)} · patch {m.patch}
                    {m.eventName ? ` · ${m.eventName}` : ""}
                  </div>
                </div>
                <Badge tone="neutral">{competitionModeLabel(m.mode)}</Badge>
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
          })}
        </PanelBody>
      </Panel>
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value: string; options: Array<[string, string]> }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-fg-subtle">{label}</span>
      <select name={name} defaultValue={value} className="h-8 max-w-[180px] rounded-md border border-border bg-bg-elevated px-2 text-xs">
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
