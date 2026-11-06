import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Crown, Flame, Medal, Sparkles, Trophy, TrendingUp } from "lucide-react";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { CardAvatar, CardName, cardColourVars } from "@/components/players/card-look";
import { RoleIcon } from "@/components/role-icon";
import { Badge } from "@/components/ui/badge";
import { SectionHeader } from "@/components/ui/section-header";
import { DataStatusNote } from "@/components/ui/data-status";
import type { DataStatus } from "@/domain/data-status";
import { ROLE_LABELS } from "@/domain/roles";
import { cn } from "@/lib/cn";
import { formatCount, formatDateTime } from "@/lib/format";
import type { BoardPlayer, FormRow, FormView, MilestoneGroup, RecentLeaderboardView, RecordHolder, RecordsView } from "@/server/leaderboards/recent-view";
import { LeaderboardsRoot } from "./leaderboards-root";
import { LeaderboardsViews } from "./leaderboards-views";
import { SeasonChoice } from "./season-choice";

/*
  TEAM LEADERBOARDS (docs/LEADERBOARDS_MODEL.md): two views of equal weight as
  secondary tabs under the Team tabs, as Match History's Games and Encounters are under a profile's.
    Recent form              one board, everyone on the same 20 recent games, ranked by win rate.
                             Every row says what counts: the record, the dates and the main role,
                             and the gap to the place above in wins. Styling is neutral on purpose:
                             no red for a cold streak (unlike win rates elsewhere), only the first
                             place's crown and your own row are marked.
    Records & achievements   single games and milestones, which reward playing more, and say so.
*/

const HEAD = "whitespace-nowrap text-2xs font-semibold uppercase tracking-label text-fg-subtle";
/** Place · player · main role · record · win rate · dates, from a 40rem board up (the row stacks below). */
const FORM_GRID = "@min-[40rem]/lb:grid-cols-[2.5rem_minmax(0,1fr)_7rem_5.5rem_4.5rem_8.5rem]";
/** Member · penta · quadra · triple. On phones the member takes the whole first line of a row and the three figures the second, under their headings, so a name is never squeezed to a sliver. */
const MULTI_GRID = "grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)] gap-x-2 px-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)] sm:gap-x-3 sm:px-4";

export function RecentLeaderboards({ view, champions, status }: { view: RecentLeaderboardView; champions: Record<string, PortraitChampion>; /** The members' page: the team's data status. */ status?: DataStatus | null }) {
  const player = (id: string) => view.players[id]!;
  const champ = (id: string | null) => (id ? (champions[id] ?? { id, name: id, portraitUrl: "" }) : null);
  const updated = view.lastUpdated ? formatDateTime(view.lastUpdated) : null;
  const scope =
    view.tab === "form" && view.form
      ? `Latest ${view.form.window.games} games from the last ${view.form.window.days} days · Summoner's Rift, 5 minutes or longer · ${view.playerCount} member${view.playerCount === 1 ? "" : "s"}`
      : view.records
        ? `${view.records.seasonLabel} · All supported games · ${formatCount(view.records.games)} games · ${view.playerCount} member${view.playerCount === 1 ? "" : "s"}`
        : "";
  return (
    <LeaderboardsRoot className="mx-auto flex w-full max-w-[var(--content-wide)] flex-col gap-4">
      <h1 className="sr-only">Team Leaderboards</h1>
      <SectionHeader
        id="leaderboards-view-title"
        title={view.tab === "form" ? "Recent form" : "Records & achievements"}
        nav={<LeaderboardsViews current={view.tab} hrefs={view.tabs} />}
        description={
          <p className="text-sm text-fg-muted" data-testid="scope-label">
            {scope}
          </p>
        }
        status={
          status ? (
            <DataStatusNote status={status} testId="leaderboards-status" />
          ) : (
            <p className="text-xs text-fg-subtle" data-testid="last-updated">
              {updated ? `Updated from the last account sync: ${updated}` : "No account sync yet"}
            </p>
          )
        }
        controls={view.records ? <SeasonChoice seasons={view.records.seasons} current={view.records.season} /> : null}
      />
      {view.playerCount === 0 ? (
        <p className="rounded-panel border border-border bg-surface p-6 text-sm text-fg-muted" data-testid="leaderboards-empty">
          No team members to compare yet. Members appear here once their account setup is finished.
        </p>
      ) : view.form ? (
        <RecentForm form={view.form} player={player} />
      ) : view.records ? (
        <Records records={view.records} player={player} champ={champ} viewerIsPlayer={!!view.viewer} />
      ) : null}
    </LeaderboardsRoot>
  );
}

/**
 * A member's picture and name, as their card shows them (their avatar frame, their name style and
 * emblem in their own colour: CardAvatar, CardName under the card's colour variables), so a member
 * is the same person on the board as on Team and Players. The ranking itself stays neutral (docs/
 * TEAM_LEADERBOARDS.md): no colour from a look reaches a place or a figure. The name links to their
 * profile for members; on the public boards, the same without a link.
 */
function Who({ p, you = false, size = "md", sub, className, nameClassName, stretch = false }: { p: BoardPlayer; you?: boolean; size?: "sm" | "md"; /** Lines under the name (the gap to the place above). */ sub?: ReactNode; className?: string; /** The name's size where a row's name is the row's primary value (the phone's form rows: text-md, as the Players rows). */ nameClassName?: string; /** On phones the link covers its row (the nearest positioned box), so the whole row is one tap, as on Players (docs/MOBILE.md, touch targets). */ stretch?: boolean }) {
  const name = p.profileHref ? (
    <Link href={p.profileHref} className={cn("min-w-0 rounded-sm text-fg hover:underline", stretch && "max-md:after:absolute max-md:after:inset-0")}>
      <CardName look={p.look} name={p.name} className={nameClassName} />
    </Link>
  ) : (
    <CardName look={p.look} name={p.name} className={cn("min-w-0 text-fg", nameClassName)} />
  );
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5 text-sm", className)} style={cardColourVars(p.look)}>
      <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size={size} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          {name}
          {you ? <Badge tone="accent" className="shrink-0">You</Badge> : null}
        </span>
        {sub}
      </span>
    </span>
  );
}

// ── Recent form ─────────────────────────────────────────────────────────────────────────────────

function RecentForm({ form, player }: { form: FormView; player: (id: string) => BoardPlayer }) {
  const ranked = form.rows.filter((r) => r.status === "established");
  const provisional = form.rows.filter((r) => r.status === "provisional");
  return (
    <section aria-labelledby="form-board-title" className="flex min-w-0 flex-col gap-3" data-testid="form">
      <h3 id="form-board-title" className="sr-only">
        Ranked by win rate over each member&apos;s latest {form.window.games} games
      </h3>
      {form.rows.length === 0 ? (
        <p className="rounded-panel border border-dashed border-border p-6 text-center text-sm text-fg-muted" data-testid="form-empty">
          Nobody has {form.window.provisionalFrom} games in the last {form.window.days} days yet. Members appear here from their {form.window.provisionalFrom}th recent game.
        </p>
      ) : (
        <div className="@container/lb overflow-hidden rounded-card border border-border bg-surface panel-depth" data-testid="form-board">
          <div className={cn("hidden items-center gap-x-4 border-b border-border/70 py-2.5 pl-4 pr-4 @min-[40rem]/lb:grid", FORM_GRID)} aria-hidden data-testid="form-heads">
            <span className={HEAD}>#</span>
            <span className={HEAD}>Member</span>
            <span className={HEAD}>Main role</span>
            <span className={cn(HEAD, "text-right")}>Record</span>
            <span className={cn(HEAD, "text-right")}>Win rate</span>
            <span className={cn(HEAD, "text-right")}>Games from</span>
          </div>
          {ranked.length ? (
            <ol className="divide-y divide-border/60" aria-label="Ranking" data-testid="form-rows">
              {ranked.map((r) => (
                <FormRowItem key={r.playerId} r={r} p={player(r.playerId)} />
              ))}
            </ol>
          ) : null}
          {provisional.length ? (
            <>
              <p className={cn("border-y border-border/70 bg-surface-2/40 px-4 py-2 text-xs text-fg-muted", !ranked.length && "border-t-0")} data-testid="form-provisional-head">
                <span className="font-semibold text-fg">Provisional</span> · {form.window.provisionalFrom} to {form.window.games - 1} recent games, listed after every full window
              </p>
              <ol className="divide-y divide-border/60" aria-label="Provisional" data-testid="form-provisional">
                {provisional.map((r) => (
                  <FormRowItem key={r.playerId} r={r} p={player(r.playerId)} />
                ))}
              </ol>
            </>
          ) : null}
        </div>
      )}
      {form.notEnough.length ? (
        <p className="px-1 text-sm text-fg-muted" data-testid="form-not-enough">
          <span className="font-medium text-fg">Not enough recent games</span> ({form.window.provisionalFrom} needed in the last {form.window.days} days):{" "}
          {form.notEnough.map((n, i) => (
            <span key={n.playerId} data-testid="form-not-enough-member" data-player-id={n.playerId}>
              {i ? "; " : ""}
              {player(n.playerId).name} needs {n.needed} more game{n.needed === 1 ? "" : "s"}
              {n.lastGame ? ` (last game ${n.lastGame})` : " (no games yet)"}
            </span>
          ))}
        </p>
      ) : null}
      <p className="px-1 text-xs text-fg-muted" data-testid="form-footnote">
        {form.window.games} games is a short sample: places within 2 wins of each other are close. The notes assume the players above don&apos;t play in the meantime. Every linked account counts, a game seen from two accounts once; remakes are left out.
      </p>
    </section>
  );
}

function FormRowItem({ r, p }: { r: FormRow; p: BoardPlayer }) {
  const roleTitle = r.role ? `${ROLE_LABELS[r.role.role]}: ${r.role.games} of ${r.games} games` : "No role recorded";
  const role = r.role ? (
    <>
      <RoleIcon role={r.role.role} className="h-3.5 w-3.5 shrink-0 text-fg-muted" decorative />
      <span className="truncate">{ROLE_LABELS[r.role.role]}</span>
      <span className="sr-only">
        {" "}
        main role ({r.role.games} of {r.games} games)
      </span>
    </>
  ) : (
    <span className="text-fg-subtle">—</span>
  );
  const record = (
    <>
      <span aria-hidden>
        {r.wins}W {r.losses}L
      </span>
      <span className="sr-only">
        {r.wins} wins, {r.losses} losses
      </span>
    </>
  );
  return (
    <li className={cn("relative grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 @min-[40rem]/lb:gap-x-4 @min-[40rem]/lb:px-4", FORM_GRID, r.you && "bg-accent/5", p.profileHref && "max-md:active:bg-surface-2")} data-testid="form-row" data-place={r.place ?? undefined} data-status={r.status} data-player-id={r.playerId} data-win-rate={r.winRate} data-games={r.games} data-wins={r.wins} data-you={r.you || undefined} data-tied={r.tied || undefined}>
      {r.you ? <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden /> : null}
      <span className="flex items-center gap-0.5 text-sm font-bold tabular-nums text-fg" data-testid="form-place">
        {r.place === null ? (
          <span className="text-fg-subtle" title="Provisional">
            <span aria-hidden>–</span>
            <span className="sr-only">Provisional</span>
          </span>
        ) : (
          <>
            {r.place}
            {r.tied ? (
              <>
                <span aria-hidden>=</span>
                <span className="sr-only"> (shared)</span>
              </>
            ) : null}
            {r.place === 1 ? <Crown className="ml-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-label="First place" role="img" /> : null}
          </>
        )}
      </span>
      <Who
        p={p}
        you={r.you}
        stretch
        nameClassName="max-md:text-md max-md:leading-snug"
        sub={
          <>
            {r.note ? (
              <span className="text-pretty text-xs text-fg-muted" data-testid="form-note">
                {r.note}
              </span>
            ) : null}
            {/* Phones: the role, record and dates under the name (from 40rem each has its column). */}
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-fg-muted @min-[40rem]/lb:hidden" data-testid="form-meta">
              <span className="flex items-center" title={roleTitle}>
                {r.role ? (
                  <>
                    <RoleIcon role={r.role.role} className="h-3.5 w-3.5 shrink-0 text-fg-muted" decorative />
                    <span className="sr-only">
                      {ROLE_LABELS[r.role.role]} main role ({r.role.games} of {r.games} games)
                    </span>
                  </>
                ) : (
                  <span className="text-fg-subtle">—</span>
                )}
              </span>
              <span aria-hidden>·</span>
              <span>{record}</span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">{r.dates}</span>
            </span>
          </>
        }
      />
      <span className="text-right text-lg font-semibold tabular-nums text-fg @min-[40rem]/lb:hidden">
        {r.winRate}%<span className="sr-only"> win rate</span>
      </span>
      <span className="hidden min-w-0 items-center gap-1.5 text-sm text-fg-muted @min-[40rem]/lb:flex" title={roleTitle} data-testid="form-role">
        {role}
      </span>
      <span className="hidden text-right text-sm tabular-nums text-fg-muted @min-[40rem]/lb:block" data-testid="form-record">
        {record}
      </span>
      <span className="hidden text-right text-base font-semibold tabular-nums text-fg @min-[40rem]/lb:block" data-testid="form-win-rate">
        {r.winRate}%<span className="sr-only"> win rate</span>
      </span>
      <span className="hidden whitespace-nowrap text-right text-sm tabular-nums text-fg-muted @min-[40rem]/lb:block" data-testid="form-dates">
        <span className="sr-only">Games from </span>
        {r.dates}
      </span>
    </li>
  );
}

// ── Records & achievements ──────────────────────────────────────────────────────────────────────

function Records({ records, player, champ, viewerIsPlayer }: { records: RecordsView; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; viewerIsPlayer: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="records">
      <p className="flex items-start gap-2 text-sm text-fg-muted" data-testid="records-volume-note">
        <Medal className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
        <span>Records and achievements reward playing more: every game is another chance. How members are doing lately is on Recent form.</span>
      </p>

      <section aria-labelledby="season-records-title" className="flex min-w-0 flex-col gap-3">
        <h3 id="season-records-title" className="text-base font-semibold text-fg">
          Season records
        </h3>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3" data-testid="season-records">
          {records.records.map((r) => (
            <li key={r.id} className="min-w-0">
              <RecordCard label={r.label} definition={r.definition} holder={r.holder} yours={r.yours} viewerIsPlayer={viewerIsPlayer} id={r.id} player={player} champ={champ} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="multikills-title" className="flex min-w-0 flex-col gap-3">
        <h3 id="multikills-title" className="flex items-center gap-1.5 text-base font-semibold text-fg">
          <Flame className="h-4 w-4 text-fg-subtle" aria-hidden /> Multikills · {records.seasonLabel}
        </h3>
        {records.multikillNote ? (
          <p className="text-xs text-fg-muted" data-testid="multikill-note">
            {records.multikillNote}
          </p>
        ) : null}
        {records.multikills.length ? (
          <div className="overflow-hidden rounded-card border border-border bg-surface" data-testid="records-multikills">
            <div className={cn("grid items-center border-b border-border/70 py-2.5", MULTI_GRID)} aria-hidden>
              <span className={HEAD}>Member</span>
              <span className={cn(HEAD, "text-right")}>Penta</span>
              <span className={cn(HEAD, "text-right")}>Quadra</span>
              <span className={cn(HEAD, "text-right")}>Triple</span>
            </div>
            <ol className="divide-y divide-border/60" aria-label="Multikills, rarest first">
              {records.multikills.map((m) => (
                <li key={m.playerId} className={cn("grid items-center py-2", MULTI_GRID)} data-testid="multikill-row" data-player-id={m.playerId} data-penta={m.penta} data-quadra={m.quadra} data-triple={m.triple}>
                  <Who p={player(m.playerId)} size="sm" className="max-sm:col-span-4" />
                  {(["penta", "quadra", "triple"] as const).map((k, i) => (
                    <span key={k} className={cn("text-right text-sm tabular-nums max-sm:row-start-2", ["max-sm:col-start-2", "max-sm:col-start-3", "max-sm:col-start-4"][i], m[k] ? "font-semibold text-fg" : "text-fg-subtle")}>
                      {m[k] ? formatCount(m[k]) : "—"}
                      <span className="sr-only"> {k === "penta" ? "pentakills" : k === "quadra" ? "quadra kills" : "triple kills"}</span>
                    </span>
                  ))}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="rounded-panel border border-dashed border-border p-4 text-sm text-fg-muted" data-testid="multikills-empty">
            No triple kills or better this season yet.
          </p>
        )}
      </section>

      <section aria-labelledby="milestones-title" className="flex min-w-0 flex-col gap-3">
        <h3 id="milestones-title" className="flex items-center gap-1.5 text-base font-semibold text-fg">
          <Sparkles className="h-4 w-4 text-fg-subtle" aria-hidden /> Lifetime and milestones
        </h3>
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <MilestoneList title={`Games on one champion · ${records.seasonLabel}`} hint="Champions with 25, 50 or 100 games this season." empty="Nobody has 25 games on one champion this season yet." groups={records.championGames} player={player} champ={champ} testId="milestones-games" />
          <MilestoneList title="Mastery on one champion · all-time" hint="Riot's champion mastery over each member's linked accounts: 100K, 500K and 1M points. The best three are shown; every champion is on the member's profile." empty="Nobody has 100K mastery points on one champion yet." groups={records.mastery} player={player} champ={champ} testId="milestones-mastery" />
        </div>
      </section>
    </div>
  );
}

const RECORD_ICON = { "win-streak": TrendingUp } as const;

function RecordCard({ id, label, definition, holder, yours, viewerIsPlayer, player, champ }: { id: string; label: string; definition: string; holder: RecordHolder | null; yours: RecordHolder | null; viewerIsPlayer: boolean; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null }) {
  const Icon = RECORD_ICON[id as keyof typeof RECORD_ICON] ?? Trophy;
  const c = holder ? champ(holder.championId) : null;
  const p = holder ? player(holder.playerId) : null;
  const detail = holder ? [c?.name, holder.role ? ROLE_LABELS[holder.role] : null, holder.kda, holder.when].filter(Boolean).join(" · ") : "";
  const body: ReactNode = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold leading-snug text-fg" data-testid="record-label">
          {label}
        </span>
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
      </span>
      {definition ? <span className="text-xs text-fg-muted">{definition}</span> : null}
      {holder && p ? (
        <>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold leading-tight tabular-nums text-fg" data-testid="record-value">
              {holder.value}
            </span>
            <span className="text-sm text-fg-muted">{holder.unit}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-sm" style={cardColourVars(p.look)}>
            <CardAvatar look={p.look} name={p.name} src={p.avatarUrl} size="sm" />
            <span className="min-w-0 text-fg" data-testid="record-holder">
              <CardName look={p.look} name={p.name} />
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-fg-muted">
            {c ? <ChampionPortrait champion={c} size="xs" title={c.name} /> : null}
            <span className="truncate">{detail}</span>
          </span>
        </>
      ) : (
        <span className="mt-1 text-sm text-fg-subtle" data-testid="record-none">
          No game sets this record yet this season.
        </span>
      )}
      {viewerIsPlayer && holder ? (
        <span className="mt-auto border-t border-border/60 pt-2 text-xs text-fg-muted" data-testid="record-yours">
          {yours ? (
            <>
              Your best: <span className="font-semibold tabular-nums text-fg">{yours.value}</span>
              {yours.when ? ` · ${yours.when}` : ""}
            </>
          ) : (
            <span className="font-medium text-fg">You hold this record</span>
          )}
        </span>
      ) : null}
    </>
  );
  const cls = "flex h-full min-w-0 flex-col gap-1.5 rounded-card border border-border bg-surface p-4";
  return holder?.href ? (
    // The card's own text is its name (what it says is what a screen reader says), ending "Open the game".
    <Link href={holder.href} className={cn(cls, "group transition-colors hover:border-border-strong focus-visible:border-accent")} data-testid="season-record" data-record={id}>
      {body}
      <span className="flex items-center gap-1 text-xs font-medium text-accent">
        Open the game <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  ) : (
    <div className={cls} data-testid="season-record" data-record={id}>
      {body}
    </div>
  );
}

const TIER_CLASS = ["border-border bg-surface-2/60", "border-border-strong bg-surface-2", "border-accent/50 bg-accent/10", "border-warn/60 bg-warn/10"] as const;

function MilestoneList({ title, hint, empty, groups, player, champ, testId }: { title: string; hint: string; empty: string; groups: MilestoneGroup[]; player: (id: string) => BoardPlayer; champ: (id: string | null) => PortraitChampion | null; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-surface p-4" data-testid={testId}>
      <h4 className="text-sm font-semibold text-fg">{title}</h4>
      <p className="text-xs text-fg-muted">{hint}</p>
      {groups.length ? (
        <ul className="divide-y divide-border/60" data-testid={`${testId}-list`}>
          {groups.map((g) => (
            <li key={g.playerId} className="flex min-w-0 flex-col gap-2 py-2.5" data-testid="milestone-member" data-player-id={g.playerId}>
              <Who p={player(g.playerId)} size="sm" />
              <ul className="flex min-w-0 flex-wrap gap-1.5" aria-label={`${player(g.playerId).name}'s milestones`}>
                {g.items.map((m) => {
                  const c = champ(m.championId);
                  return (
                    <li key={m.championId} className={cn("flex min-w-0 max-w-full items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 text-xs", TIER_CLASS[Math.min(m.tier, 3)])} title={`${c?.name ?? m.championId}: ${m.value} (${m.milestone} milestone)`} data-testid="milestone" data-tier={m.tier}>
                      {c ? <ChampionPortrait champion={c} size="xs" /> : null}
                      <span className="truncate font-medium text-fg">{c?.name ?? m.championId}</span>
                      <span className="shrink-0 tabular-nums text-fg-muted">{m.value}</span>
                    </li>
                  );
                })}
                {g.more ? (
                  <li className="self-center px-1 text-xs text-fg-muted" data-testid="milestone-more">
                    and {g.more} more
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-subtle">{empty}</p>
      )}
    </div>
  );
}
