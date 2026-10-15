import Link from "next/link";
import { notFound } from "next/navigation";
import { competitionModeLabel } from "@/domain/competition";
import { ROLE_LABELS, ROLES, type Role } from "@/domain/roles";
import { canStartNextGame, describeSeries, seriesLabel } from "@/domain/series";
import type { Playbook } from "@/domain/playbook";
import { getAppDb } from "@/server/bootstrap";
import { canControlDraft, hasPermission } from "@/server/auth/session";
import { requirePageAccess } from "@/server/auth/page-access";
import { getDraft } from "@/server/repositories/drafts";
import { enemyNameList } from "@/domain/scouting/enemy-slots";
import { listChampions } from "@/server/repositories/champions";
import { getBranding } from "@/server/repositories/branding";
import { getMatch } from "@/server/matches/repository";
import { loadLinkSuggestions } from "@/server/matches/links";
import { queueLabel } from "@/server/players/match-history";
import { listPlayers } from "@/server/repositories/team";
import { LinkSuggestions, type LinkSuggestionView } from "@/components/matches/link-suggestions";
import { previousMeetings } from "@/server/repositories/opponents";
import { getSeries, listSeriesGames } from "@/server/series/repository";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { MatchEditor } from "@/components/matches/match-editor";
import { SeriesControls } from "@/components/matches/series-controls";
import { PlaybookPanel } from "@/components/playbook/playbook-panel";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getAppDb();
  const [match, session, champions, branding] = await Promise.all([getMatch(db, id), requirePageAccess("view-matches"), listChampions(db), getBranding(db)]);
  if (!match || match.archivedAt) notFound();
  const [meetings, series, games] = await Promise.all([
    previousMeetings(db, match.teamId, match.opponentName, 10).then((rows) => rows.filter((m) => m.id !== match.id)),
    match.seriesId ? getSeries(db, match.seriesId) : Promise.resolve(null),
    match.seriesId ? listSeriesGames(db, match.seriesId) : Promise.resolve([]),
  ]);
  const championsById = Object.fromEntries(champions.map((c) => [c.id, { id: c.id, name: c.name, portraitUrl: c.portraitUrl }]));
  const champ = (cid: string | null) => (cid ? championsById[cid] ?? { id: cid, name: cid, portraitUrl: "" } : null);
  const playerName = (pid: string | null) => match.lineupSnapshot.find((p) => p.id === pid)?.displayName ?? "?";
  // The draft's creator or an admin may correct and delete the record (the server checks again).
  const draft = match.draftId ? await getDraft(db, match.draftId) : null;
  const canEdit = hasPermission(session, "manage-matches") || (!!draft && canControlDraft(session, draft));
  const playbook = match.playbook && (match.playbook as { version?: number }).version === 2 ? (match.playbook as unknown as Playbook) : null;
  const ourByRole = new Map(match.ourPicks.map((p) => [p.role, p]));
  const enemyNames = enemyNameList(match.enemyPlayers);
  // Riot games that could be this record (editors only; a person confirms every link).
  let suggestions: LinkSuggestionView[] = [];
  if (canEdit && !match.riotMatchId) {
    const [found, players] = await Promise.all([loadLinkSuggestions(db, match), listPlayers(db, match.teamId)]);
    const nameOf = (pid: string) => players.find((p) => p.id === pid)?.displayName ?? playerName(pid);
    suggestions = found.map((s) => ({
      matchId: s.matchId,
      when: new Date(s.gameCreation).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC",
      queue: queueLabel(s.queueId),
      // The lineup's result in that game (their own rows).
      result: s.win === null ? null : s.win ? "Win" : "Loss",
      minutes: s.durationS ? Math.round(s.durationS / 60) : null,
      strength: s.strength,
      reasons: s.reasons,
      played: s.played.map((p) => ({ name: nameOf(p.playerId), champion: champ(p.championId)! })),
    }));
  }

  return (
    <div className="mx-auto max-w-[var(--content-max)] space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/matches" className="text-xs text-fg-muted hover:text-fg">
          ← Matches
        </Link>
        <h1 className="min-w-0 text-lg font-bold sm:text-xl">
          {series ? `Game ${match.gameNumber} · ` : ""}vs {match.opponentName || "Unnamed opponent"} <span className="ml-2 text-sm font-normal text-fg-subtle">{formatDate(match.playedAt)} · patch {match.patch}</span>
        </h1>
        <Badge tone="neutral">{competitionModeLabel(match.mode)}</Badge>
        <Badge tone={match.side === "blue" ? "blue" : "red"}>{match.side} side</Badge>
        <Badge tone={match.result === "win" ? "good" : match.result === "loss" ? "bad" : "neutral"}>{match.result ?? "no result"}</Badge>
        {match.eventName ? <Badge tone="accent">{match.eventName}</Badge> : null}
        <span className="flex-1" />
        {match.draftId ? (
          <Link href={`/draft/${match.draftId}`} className="text-xs text-accent hover:underline">
            open the draft
          </Link>
        ) : (
          <span className="text-xs text-fg-subtle">draft deleted; record kept</span>
        )}
      </div>

      {series ? (
        <Panel className="border-info/40">
          <PanelHeader
            title={`Series · ${seriesLabel(series.bestOf)}`}
            subtitle={`${competitionModeLabel(series.mode)}${series.eventName ? ` — ${series.eventName}` : ""} · ${branding.shortName} vs ${series.opponentName || "Unnamed opponent"} · ${describeSeries({ ...series, ourName: branding.shortName, theirName: series.opponentName })}`}
            actions={<SeriesControls seriesId={series.id} status={series.status} canStartNext={canStartNextGame(series)} canEdit={canEdit} />}
          />
          <PanelBody className="flex flex-wrap gap-2 text-xs">
            {games.map((g) => (
              <Link key={g.draftId} href={g.matchId ? `/matches/${g.matchId}` : `/draft/${g.draftId}`} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${g.draftId === match.draftId ? "border-accent bg-accent/10" : "border-border bg-bg-elevated hover:bg-surface-2"}`}>
                <span className="font-semibold">Game {g.gameNumber}</span>
                <Badge tone={g.side === "blue" ? "blue" : "red"}>{g.side}</Badge>
                <Badge tone={g.result === "win" ? "good" : g.result === "loss" ? "bad" : "neutral"}>{g.result ?? (g.status === "completed" ? "no result" : g.status === "in_progress" ? "drafting" : g.status)}</Badge>
              </Link>
            ))}
          </PanelBody>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Draft" subtitle="Final picks and bans as entered." />
            <PanelBody className="grid gap-4 md:grid-cols-2">
              <div>
                <SectionLabel className="mb-1">{branding.shortName}</SectionLabel>
                <div className="mb-2 flex gap-1">{match.ourBans.map((b, i) => <ChampionPortrait key={i} champion={champ(b)} size="sm" dimmed className="grayscale" />)}</div>
                <div className="space-y-1">
                  {ROLES.map((role) => {
                    const p = ourByRole.get(role);
                    return (
                      <div key={role} className="flex items-center gap-2 text-sm">
                        <RoleIcon role={role} className="h-3.5 w-3.5 text-accent" />
                        <ChampionPortrait champion={champ(p?.championId ?? null)} size="sm" />
                        <span className="font-medium">{champ(p?.championId ?? null)?.name ?? "—"}</span>
                        <span className="text-xs text-fg-subtle">{playerName(p?.playerId ?? match.finalAssignments[role as Role])}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <SectionLabel className="mb-1">{match.opponentName || "Enemy"}</SectionLabel>
                <div className="mb-2 flex gap-1">{match.enemyBans.map((b, i) => <ChampionPortrait key={i} champion={champ(b)} size="sm" dimmed className="grayscale" />)}</div>
                <div className="space-y-1">
                  {match.enemyPicks.map((p) => (
                    <div key={p.index} className="flex items-center gap-2 text-sm">
                      <ChampionPortrait champion={champ(p.championId)} size="sm" />
                      <span className="font-medium">{champ(p.championId)?.name}</span>
                    </div>
                  ))}
                </div>
                {enemyNames.length > 0 ? (
                  <div className="mt-3 space-y-0.5 text-xs text-fg-muted">
                    <SectionLabel className="mb-1">Enemy players</SectionLabel>
                    {enemyNames.map((name) => (
                      <div key={name} className="text-fg">
                        {name}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </PanelBody>
          </Panel>
          {playbook ? <PlaybookPanel playbook={playbook} championsById={championsById} title="Playbook (as drafted)" myPlayerId={session?.playerId ?? null} /> : null}
          {match.riotInfo ? (
            <Panel>
              <PanelHeader title="Riot match" subtitle={`${match.riotMatchId} · ${(match.riotInfo as { gameVersion?: string }).gameVersion ?? ""}`} />
              <PanelBody className="text-xs text-fg-muted">
                {((match.riotInfo as { participants?: Array<{ teamId: number; championName: string; position: string; kills: number; deaths: number; assists: number; win: boolean }> }).participants ?? []).map((p, i) => (
                  <div key={i} className="flex flex-wrap gap-2">
                    <span className={cn("w-8", p.teamId === 100 ? "text-blue" : "text-red")}>{p.teamId === 100 ? "blue" : "red"}</span>
                    <span className="w-24 truncate sm:w-28">{p.championName}</span>
                    <span className="w-16">{p.position}</span>
                    <span>
                      {p.kills}/{p.deaths}/{p.assists}
                    </span>
                  </div>
                ))}
              </PanelBody>
            </Panel>
          ) : null}
        </div>
        <div className="space-y-4">
          <LinkSuggestions matchRecordId={match.id} suggestions={suggestions} />
          <div id="edit" className="scroll-mt-20">
          <MatchEditor
            match={{ id: match.id, result: match.result, durationSeconds: match.durationSeconds, riotMatchId: match.riotMatchId, notes: match.notes, vodUrl: match.vodUrl, playedAt: match.playedAt.toISOString(), eventName: match.eventName, opponentName: match.opponentName, enemyPlayers: match.enemyPlayers ?? {}, mode: match.mode, inSeries: !!match.seriesId }}
            canEdit={canEdit}
            riotConfigured={!!process.env.RIOT_API_KEY}
          />
          </div>
          <Panel>
            <PanelHeader title="Lineup" />
            <PanelBody className="space-y-1 text-sm">
              {ROLES.map((role) => (
                <div key={role} className="flex items-center gap-2">
                  <RoleIcon role={role} className="h-3.5 w-3.5 text-fg-subtle" />
                  <span className="w-16 text-xs text-fg-subtle">{ROLE_LABELS[role]}</span>
                  <span>{playerName(match.finalAssignments[role as Role])}</span>
                </div>
              ))}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Previous meetings" subtitle="Same opponent label, reference only." />
            <PanelBody className="divide-y divide-border p-0">
              {meetings.length === 0 ? <p className="px-4 py-3 text-xs text-fg-muted">{match.opponentName ? "No other saved matches against this opponent." : "Give the opponent a label to see previous meetings."}</p> : null}
              {meetings.map((m) => (
                <Link key={m.id} href={`/matches/${m.id}`} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-surface-2">
                  <span className="w-24 text-fg-subtle">{formatDate(m.playedAt)}</span>
                  <Badge tone={m.result === "win" ? "good" : m.result === "loss" ? "bad" : "neutral"}>{m.result ?? "no result"}</Badge>
                  <div className="flex gap-0.5">{m.ourPicks.map((p) => <ChampionPortrait key={p.index} champion={champ(p.championId)} size="xs" />)}</div>
                </Link>
              ))}
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}
