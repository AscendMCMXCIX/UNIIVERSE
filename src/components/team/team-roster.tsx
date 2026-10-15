"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, ChevronLeft, ChevronRight, Pencil, Swords, UserPlus, Users, X } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { RosterSlot } from "@/server/team/roster";
import { ACCENT_COLOR } from "@/domain/player-card";
import { accentCss } from "@/domain/card-style";
import { CardFrame, cardShellStyle } from "@/components/players/card-look";
import { setLineupSlotAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champion-picker";
import { Button, buttonClass } from "@/components/ui/button";
import { RoleIcon } from "@/components/role-icon";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { CardArtLayer } from "@/components/players/card-art";
import { CustomiseCardButton } from "@/components/players/customise-card";
import { CardIdentity, CardRoleChip, PoolChampionRow, PoolPreview, SeasonTiles } from "@/components/players/player-card";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { InfoTip } from "@/components/ui/info-tip";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { toast } from "@/components/ui/toast";
import { PoolSection } from "@/components/profile/profile-editor";
import { poolOfRole, setPoolOfRole, useProfileAutosave } from "@/components/profile/use-profile-autosave";
import { cn } from "@/lib/cn";
import { assignmentStatus } from "@/domain/roster";
import { WIN_RATE_MIN_GAMES, WIN_RATE_TONE_CLASS, winRateTone } from "@/domain/stats/win-rate";

type ChampionsById = Map<string, { id: string; name: string; portraitUrl: string }>;
const lookup = (championsById: ChampionsById, id: string) => championsById.get(id) ?? { id, name: id, portraitUrl: "" };

/**
 * One lineup slot as a compact player card, the same structure for everyone: artwork with the
 * role and identity, this season's four figures in the role they hold, and the first champions of
 * their pool for that role. The whole card opens the detail panel (full pool and statistics) over
 * the page, so the lineup never moves. Controls sit above that click area: personalising (own
 * card) and lineup changes (edit mode) on the artwork.
 */
function RosterCard({ slot, championsById, canManageLineup, editingLineup, canEdit, viewerPlayerId, champions, onOpen }: { slot: RosterSlot; champions: PickerChampion[]; championsById: ChampionsById; canManageLineup: boolean; editingLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onOpen: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const p = slot.player;
  const accent = p ? accentCss(p.look.style) : ACCENT_COLOR.default;
  const assign = async (playerId: string | null) => {
    setBusy(true);
    const r = await setLineupSlotAction(slot.role, playerId);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(playerId ? `${slot.roleLabel} updated.` : `${slot.roleLabel} cleared.`);
    router.refresh();
  };
  const candidates = slot.candidates;
  const lineupMenu =
    canManageLineup && editingLineup ? (
      <Menu
        label={`${slot.roleLabel} player`}
        className="w-[min(17rem,calc(100vw-2rem))]"
        testId={`lineup-menu-${slot.role}`}
        trigger={(t) => (
          <Button {...t} size="sm" variant="primary" className="shadow-lg shadow-black/40" disabled={busy} aria-label={`${p ? "Change" : "Assign"} ${slot.roleLabel} player`}>
            <ArrowLeftRight className="h-3.5 w-3.5" /> {p ? "Change" : "Assign"}
          </Button>
        )}
      >
        <MenuLabel>Team members who list {slot.roleLabel}</MenuLabel>
        {candidates.length === 0 ? <div className="px-3 py-2 text-xs text-fg-muted">No team member lists {slot.roleLabel}.</div> : null}
        {candidates.map((c) => (
          <MenuItem key={c.id} onSelect={() => void assign(c.id)} active={c.id === p?.id} hint={c.fit === "primary" ? "primary role" : c.fit === "other" ? "out of role" : "off role"}>
            {c.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        {p ? (
          <MenuItem onSelect={() => void assign(null)} icon={<X className="h-4 w-4" />}>
            Clear this role
          </MenuItem>
        ) : null}
      </Menu>
    ) : null;
  const own = !!p && p.id === viewerPlayerId && canEdit;
  // Support is judged on vision, not farm: its cards show average vision score where others show CS/min.
  const support = slot.role === "SUPPORT";
  // Main Role or Off Role for the position held (the Team page shows the assignment, not the preference).
  const status = p ? assignmentStatus(p, slot.role) : null;

  return (
    <article className={cn("rise-in group/card relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border bg-surface transition-colors", editingLineup ? "border-accent/50" : "border-border hover:border-border-strong")} style={p ? { ...cardShellStyle(p.look), ...(editingLineup ? { borderColor: undefined } : {}) } : { ["--card-accent" as string]: accent }} data-frame={p?.look.style.frame} data-fx-host data-testid={`lineup-row-${slot.role}`} data-player-id={p?.id} data-player-name={p?.name} data-pool-size={slot.champions.length} data-off-role={status ? status === "off" : undefined} data-role-status={status ?? undefined}>
      <CardFrame look={p?.look} />
      {p ? (
        // The whole card opens the detail panel; the controls below are drawn above this button.
        <button type="button" onClick={onOpen} className="absolute inset-0 z-[1] rounded-card focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent" aria-label={`${p.name}, ${slot.roleLabel}: champions and statistics`} aria-haspopup="dialog" data-testid="open-player-detail" />
      ) : null}
      <div className="pointer-events-none relative h-28 shrink-0 overflow-hidden sm:h-32 [&_.card-art-img]:group-hover/card:scale-[1.03] motion-reduce:[&_.card-art-img]:group-hover/card:scale-100" data-testid="card-art">
        {/* Splash of the player's chosen champion and skin, darkened towards the text, tinted with their accent. */}
        <CardArtLayer art={p?.art ?? null} accent={accent} kind="splash" position="center 22%" look={p?.look} motion="hover" />
        <CardRoleChip role={slot.role} label={slot.roleLabel} className="absolute left-3 top-3" />
        {p ? (
          <span className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
            <CardIdentity look={p.look} name={p.name} avatarUrl={p.avatarUrl} rank={p.rank} isYou={p.id === viewerPlayerId} status={status} role={slot.role} />
          </span>
        ) : null}
      </div>
      {/* Over the art, so permissions and edit mode never move anything else on the card. */}
      <span className="absolute right-2.5 top-2.5 z-[2] flex items-center gap-1">
        {own && !editingLineup && p ? <CustomiseCardButton variant="icon" playerId={p.id} name={p.name} avatarUrl={p.avatarUrl} art={p.art} accent={p.cardAccent} look={p.look} champions={champions} poolIds={p.poolIds} preview={{ role: slot.role, rank: p.rank, status, season: p.season, poolIds: slot.champions.map((c) => c.championId) }} /> : null}
        {lineupMenu}
      </span>
      {p ? (
        <div className="pointer-events-none relative flex flex-1 flex-col gap-3 px-3.5 pb-3 pt-3">
          <SeasonTiles season={p.season} support={support} />
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-2.5">
            <PoolPreview champions={slot.champions.map((c) => lookup(championsById, c.championId))} total={slot.champions.length} label={`${slot.roleLabel} champion pool, in order of preference`} />
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-fg-subtle group-hover/card:text-accent">
              <span className="max-[400px]:sr-only">{slot.roleLabel} pool</span>
              {slot.champions.length ? <span className="max-[400px]:hidden"> · </span> : null}
              {slot.champions.length ? slot.champions.length : null} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3" data-testid={`vacancy-${slot.role}`}>
          <div className="flex items-center gap-3 text-sm text-fg-subtle">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-dashed border-border-strong">
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            {canManageLineup ? (editingLineup ? "Choose a player with Assign" : "No player yet: use Edit lineup") : "Not assigned yet"}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-fg-subtle">Suggested</p>
            {slot.suggestions.length === 0 ? (
              <p className="mt-1 text-sm text-fg-muted">No registered player lists {slot.roleLabel} as a role.{canManageLineup ? " Add one in Admin → People & Access." : ""}</p>
            ) : (
              <ul className="mt-1.5 space-y-2" data-testid="lineup-suggestions">
                {slot.suggestions.slice(0, 3).map((sg) => (
                  <li key={sg.playerId} className="rounded-lg border border-border bg-surface/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Link href={`/players/${sg.playerId}`} className="min-w-0 truncate font-medium text-fg hover:underline">
                          {sg.name}
                        </Link>
                      </span>
                      {canManageLineup && editingLineup ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => assign(sg.playerId)} aria-label={`Assign ${sg.name} to ${slot.roleLabel}`}>
                          Assign
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{sg.reasons.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * A lineup player in detail, over the page (a side panel on wider screens, a bottom sheet on
 * phones): the season in the role they hold, then their whole pool for it with each champion's
 * figures and proficiency, and the way to their full profile. Previous / next move through the
 * lineup without closing it. Editing the champions opens the same editor as before.
 */
function PlayerDetailPanel({ slot, championsById, canEdit, onClose, onPrev, onNext, onEdit, position }: { slot: RosterSlot; championsById: ChampionsById; canEdit: boolean; onClose: () => void; onPrev: (() => void) | null; onNext: (() => void) | null; onEdit: () => void; position: string }) {
  const p = slot.player!;
  const support = slot.role === "SUPPORT";
  const season = p.season;
  const status = assignmentStatus(p, slot.role);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft" && onPrev) onPrev();
      if (e.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPrev, onNext]);
  const nav = "grid h-9 w-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-30 pointer-coarse:h-11 pointer-coarse:w-11";
  const figure = (label: string, value: React.ReactNode, sub?: React.ReactNode, tone?: string) => (
    <div className="rounded-lg bg-bg px-2.5 py-2">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", tone ?? "text-fg")}>{value}</dd>
      {sub ? <dd className="text-[0.6875rem] text-fg-subtle">{sub}</dd> : null}
    </div>
  );
  return (
    <Drawer
      open
      onClose={onClose}
      sheetOnPhone
      title={`${p.name} · ${slot.roleLabel}`}
      titleId="player-detail-title"
      description={`${position} in the lineup · ${p.seasonLabel}`}
      testId="player-detail"
      headerExtra={
        <>
          <button type="button" className={nav} onClick={onPrev ?? undefined} disabled={!onPrev} aria-label="Previous player" data-testid="detail-prev">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" className={nav} onClick={onNext ?? undefined} disabled={!onNext} aria-label="Next player" data-testid="detail-next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      }
    >
      <div className="space-y-4" style={{ ["--card-accent" as string]: accentCss(p.look.style) }}>
        <div className="flex items-center justify-between gap-3">
          <CardIdentity look={p.look} name={p.name} avatarUrl={p.avatarUrl} rank={p.rank} status={status} role={slot.role} size="md" nameClassName="text-base drop-shadow-none" />
          <Link href={`/players/${p.id}`} className={buttonClass("outline", "sm", "shrink-0")} data-testid="detail-profile-link">
            Full profile <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {/* One line of ranked progress; the chart and every rank change are on the profile. */}
        {p.rankChange ? (
          <Link href={`/players/${p.id}${p.rankChange.queue === "flex" ? "?rq=flex" : ""}#ranked-progress`} className="flex flex-wrap items-center gap-x-1.5 text-xs text-fg-muted hover:text-fg" data-testid="detail-rank-change">
            <span className="font-medium text-fg">Ranked {p.rankChange.queue === "flex" ? "Flex" : "Solo/Duo"}</span>
            <span className={cn("font-semibold tabular-nums", p.rankChange.points > 0 ? "text-good" : p.rankChange.points < 0 ? "text-bad" : "text-fg-muted")}>
              {p.rankChange.points > 0 ? "+" : ""}
              {p.rankChange.points} ladder points
            </span>
            <span>
              in {p.rankChange.days} days ({p.rankChange.from} → {p.rankChange.to})
            </span>
          </Link>
        ) : null}

        <section aria-labelledby="detail-season" className="space-y-2">
          <h3 id="detail-season" className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            {slot.roleLabel} this season
            <InfoTip text="Supported games this season (Ranked Solo/Duo, Ranked Flex, Normal games) played in this role, on any champion, from every linked Riot account." label="What these figures count" />
          </h3>
          {season ? (
            <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" data-testid="detail-season">
              {figure("Record", `${season.wins}W ${season.losses}L`, `${season.games} game${season.games === 1 ? "" : "s"}`)}
              {figure("Win rate", season.winRate === null ? "—" : `${Math.round(season.winRate * 100)}%`, season.games < WIN_RATE_MIN_GAMES.season ? "small sample" : undefined, WIN_RATE_TONE_CLASS[winRateTone(season.winRate, season.games, WIN_RATE_MIN_GAMES.season)])}
              {figure("KDA", season.perfectKda ? "Perfect" : season.kda === null ? "—" : season.kda.toFixed(2), season.kills !== null && season.deaths !== null && season.assists !== null ? `${season.kills.toFixed(1)} / ${season.deaths.toFixed(1)} / ${season.assists.toFixed(1)}` : undefined)}
              {support ? figure("Vision", season.visionPerGame === null ? "—" : season.visionPerGame.toFixed(1), "per game") : figure("CS/min", season.csPerMinute === null ? "—" : season.csPerMinute.toFixed(1), "minions + monsters")}
              {figure("Damage/min", season.damagePerMinute === null ? "—" : Math.round(season.damagePerMinute).toLocaleString("en"), "to champions")}
              {support ? figure("CS/min", season.csPerMinute === null ? "—" : season.csPerMinute.toFixed(1)) : figure("Vision", season.visionPerGame === null ? "—" : season.visionPerGame.toFixed(1), "per game")}
            </dl>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-fg-muted">No {slot.roleLabel} games stored this season yet.</p>
          )}
        </section>

        <section aria-labelledby="detail-pool" className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 id="detail-pool" className="text-sm font-semibold text-fg">
              {slot.roleLabel} pool{slot.champions.length ? <span className="font-normal text-fg-subtle"> · {slot.champions.length}, in order of preference</span> : null}
            </h3>
            {canEdit && p.poolSlot ? (
              <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${p.name}'s ${slot.roleLabel} champions`} data-testid="edit-roster-champions">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            ) : null}
          </div>
          {slot.champions.length === 0 ? (
            <p className="py-2 text-sm text-warn">No {slot.roleLabel} champions yet.</p>
          ) : (
            <ol className="divide-y divide-border/60" data-testid="pool-list" aria-label={`${slot.roleLabel} champion pool, in order of preference`}>
              {slot.champions.map((c, i) => (
                <PoolChampionRow key={c.championId} index={i} champion={lookup(championsById, c.championId)} row={c} support={support} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </Drawer>
  );
}

/** Edit the champions a player brings to their lineup role, without leaving the Team page. */
function RosterPoolDialog({ slot, champions, onClose }: { slot: RosterSlot; champions: PickerChampion[]; onClose: () => void }) {
  const router = useRouter();
  const p = slot.player!;
  const { state, status, error, update, retry } = useProfileAutosave(p.id, p.profile, p.version);
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  return (
    <Dialog
      open
      onClose={() => {
        onClose();
        router.refresh();
      }}
      title={`${p.name} · ${slot.roleLabel} champions`}
      description="Changes save automatically. Order is preference only."
      className="sm:max-w-3xl"
      footer={
        <>
          <SaveStatusIndicator status={status} error={error} onRetry={() => void retry()} />
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              router.refresh();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <PoolSection title={`${p.poolSlot === "primary" ? "Primary role" : "Off role"} champions`} role={slot.role as Role} ids={poolOfRole(state, slot.role as Role)} champions={champions} championsById={championsById} onChange={(ids) => update(setPoolOfRole(state, slot.role as Role, ids))} editable testId="roster-pool" />
    </Dialog>
  );
}

/** One width for the header, the cards and the footer, following the card grid's own breakpoints. */
const LINEUP_WIDTH = "mx-auto w-full max-w-[26rem] @xl:max-w-[54rem] @4xl:max-w-[80rem] @7xl:max-w-[118rem]";

/**
 * OUR TEAM: the page header and the main lineup as five player cards, as one centred section.
 * Two separate actions: "Edit lineup" (lineup managers only) switches every card into a mode with
 * a Change/Assign control; your own card's brush personalises its look. Players edit their own
 * champions in place. On phones the five cards are a swipeable track (native scrolling with
 * snap points), with dots and arrows to tell where you are.
 */
export function TeamRoster({ slots, complete, champions, canManageLineup, editablePlayerIds, viewerPlayerId }: { slots: RosterSlot[]; complete: boolean; champions: PickerChampion[]; canManageLineup: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null }) {
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [editingLineup, setEditingLineup] = React.useState(false);
  // The player whose detail panel is open (by role), or null.
  const [detail, setDetail] = React.useState<Role | null>(null);
  const filled = slots.filter((s) => s.player);
  const detailIndex = filled.findIndex((s) => s.role === detail);
  const detailSlot = detailIndex >= 0 ? filled[detailIndex] : null;
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const editable = new Set(editablePlayerIds);
  const editingSlot = slots.find((s) => s.role === editing && s.player);
  const { ref: trackRef, index: current, onScroll: onTrackScroll, go } = useLineupTrack(slots.length);
  return (
    // The header and the cards are one block, centred in the space under the top bar when the
    // window is tall enough (a short window simply scrolls).
    <div className="@container flex flex-1 flex-col justify-center gap-4 py-1 lg:py-4" data-testid="lineup-frame">
      <header className={cn(LINEUP_WIDTH, "flex flex-col items-center gap-2 text-center")} data-testid="team-header">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Team Overview</h1>
        <p className="max-w-xl text-sm text-fg-muted" data-testid="team-subtitle">
          {editingLineup ? "Editing the lineup: use Change on a card to put another player in that role." : "Our main lineup: who plays each role and what they bring to it."}
        </p>
        {canManageLineup ? (
          <Button size="sm" variant={editingLineup ? "primary" : "outline"} onClick={() => setEditingLineup((v) => !v)} aria-pressed={editingLineup} data-testid="edit-lineup">
            {editingLineup ? (
              <>
                <Check className="h-4 w-4" /> Done
              </>
            ) : (
              <>
                <Users className="h-4 w-4" /> Edit lineup
              </>
            )}
          </Button>
        ) : null}
      </header>
      {/* Phones (a narrow content area): one track of five cards that scrolls sideways on its own,
          one card in view with the next peeking in. Wider: a grid of half-width tracks where every
          row shares one height (auto-rows-fr) and a short last row is centred (2 + 2 + 1, 3 + 2),
          five across when the content area allows. Cards never shrink below a readable width. */}
      <div className="relative">
        {/* Where you are in the track, and a way to move without swiping (phones only). */}
        <div className="mb-2 flex items-center justify-center gap-2 @xl:hidden" data-testid="lineup-pager">
          <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className="grid h-9 w-9 place-items-center rounded-full border border-border text-fg-muted disabled:opacity-30" aria-label="Previous player" data-testid="lineup-prev">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-1" role="tablist" aria-label="Lineup position">
            {slots.map((s, i) => (
              <button key={s.role} type="button" role="tab" aria-selected={current === i} aria-label={`${s.roleLabel}${s.player ? `: ${s.player.name}` : ""}`} title={s.roleLabel} onClick={() => go(i)} className={cn("grid h-10 w-10 place-items-center rounded-full border transition-colors motion-reduce:transition-none", current === i ? "border-accent bg-accent/15 text-accent" : "border-transparent text-fg-subtle")} data-testid="lineup-dot">
                <RoleIcon role={s.role} className="h-4 w-4" />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => go(current + 1)} disabled={current === slots.length - 1} className="grid h-9 w-9 place-items-center rounded-full border border-border text-fg-muted disabled:opacity-30" aria-label="Next player" data-testid="lineup-next">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={trackRef}
          onScroll={onTrackScroll}
          className={cn(
            "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-[7%] pb-1 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden",
            "-mx-4",
            "@xl:mx-auto @xl:grid @xl:max-w-[54rem] @xl:auto-rows-fr @xl:grid-cols-4 @xl:overflow-visible @xl:px-0 @xl:pb-0 @xl:[&>*]:col-span-2 @xl:[&>*:nth-child(5)]:col-start-2",
            "@4xl:max-w-[80rem] @4xl:grid-cols-6 @4xl:[&>*:nth-child(4)]:col-start-2 @4xl:[&>*:nth-child(5)]:col-start-auto",
            "@7xl:max-w-[118rem] @7xl:grid-cols-5 @7xl:[&>*]:col-span-1 @7xl:[&>*:nth-child(4)]:col-start-auto",
          )}
          role="region"
          aria-roledescription="carousel"
          aria-label="Main lineup"
          data-testid="lineup-overview"
        >
          {slots.map((s, i) => (
            <div key={s.role} className="flex w-[86%] max-w-[26rem] shrink-0 snap-center snap-always @xl:w-auto @xl:max-w-none @xl:min-w-0" role="group" aria-roledescription="slide" aria-label={`${s.roleLabel}: ${s.player?.name ?? "no player"} (${i + 1} of ${slots.length})`} data-testid="lineup-cell">
              <RosterCard slot={s} champions={champions} championsById={championsById} canManageLineup={canManageLineup} editingLineup={editingLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onOpen={() => setDetail(s.role)} />
            </div>
          ))}
        </div>
      </div>
      <div className={cn(LINEUP_WIDTH, "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          {complete ? "Lineup complete. Roles can still be flexed during the draft." : canManageLineup ? "Assign all five roles to start drafting." : "A lineup manager assigns the five roles."}
          <InfoTip text="Each card is about the role the player holds in this lineup: its figures count this season's supported games (Ranked Solo/Duo, Ranked Flex, Normal games) played in that role, on any champion, from their linked Riot accounts; the champions are their whole pool for that role, in order of preference. Hover a tag for the evidence behind it." />
        </p>
        <Link href="/draft" className={buttonClass("primary", "lg", cn("w-full sm:w-auto", !complete && "pointer-events-none opacity-50"))} aria-disabled={!complete}>
          <Swords className="h-4 w-4" /> Start a draft
        </Link>
      </div>
      {detailSlot && !editingSlot ? (
        <PlayerDetailPanel
          slot={detailSlot}
          championsById={championsById}
          canEdit={!!detailSlot.player && editable.has(detailSlot.player.id) && champions.length > 0}
          onClose={() => setDetail(null)}
          onPrev={detailIndex > 0 ? () => setDetail(filled[detailIndex - 1]!.role) : null}
          onNext={detailIndex < filled.length - 1 ? () => setDetail(filled[detailIndex + 1]!.role) : null}
          onEdit={() => setEditing(detailSlot.role)}
          position={`${detailIndex + 1} of ${filled.length}`}
        />
      ) : null}
      {editingSlot && champions.length > 0 ? <RosterPoolDialog slot={editingSlot} champions={champions} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

/**
 * The phone track: which card is in view (updated only when it changes, from the scroll position
 * read once per frame), and moving to a card from the dots or arrows. Wider layouts are a grid,
 * where none of this does anything.
 */
function useLineupTrack(count: number) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const frame = React.useRef(0);
  const onScroll = React.useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      if (!el || el.scrollWidth <= el.clientWidth) return;
      const centre = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestDist = Infinity;
      [...el.children].forEach((c, i) => {
        const child = c as HTMLElement;
        const d = Math.abs(child.offsetLeft + child.offsetWidth / 2 - centre);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setIndex((cur) => (cur === best ? cur : best));
    });
  }, []);
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const go = React.useCallback(
    (i: number) => {
      const el = ref.current;
      const target = el?.children[Math.max(0, Math.min(count - 1, i))] as HTMLElement | undefined;
      if (!el || !target) return;
      el.scrollTo({ left: target.offsetLeft + target.offsetWidth / 2 - el.clientWidth / 2, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    },
    [count],
  );
  return { ref, index, onScroll, go };
}
