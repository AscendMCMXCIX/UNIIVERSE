"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Pencil, Swords, UserPlus, Users, X } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { RosterSlot } from "@/server/team/roster";
import type { ProficiencyTier } from "@/domain/proficiency";
import { TierBadge } from "@/components/players/tier-badge";
import { ACCENT_COLOR } from "@/domain/player-card";
import { setLineupSlotAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { CardArtLayer } from "@/components/players/card-art";
import { CustomiseCardButton } from "@/components/players/customise-card";
import { Dialog } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { toast } from "@/components/ui/toast";
import { PoolSection } from "@/components/profile/profile-editor";
import { poolOfRole, setPoolOfRole, useProfileAutosave } from "@/components/profile/use-profile-autosave";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { RankInline } from "@/components/players/rank-emblem";


/** Where the player stands in this role, in a few words (shown in the card's identity line). */
function compactPoints(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString("en");
}

/** The assigned role is not the player's Primary Role (the Team page shows the assignment, not the preference). */
function offRole(p: NonNullable<RosterSlot["player"]>): boolean {
  return p.profileRole !== "primary";
}

/**
 * One lineup slot as a player card, the same structure for everyone: splash art with the
 * identity, this season's figures in the role they hold, then every champion of their pool for
 * that role (in their order) with its games, win rate and proficiency in that role. Nothing is
 * generated or summarised: what is shown is what they play. Controls never change the layout:
 * personalising (own card) and lineup changes (edit mode) sit over the artwork.
 */
function RosterCard({ slot, championsById, canManageLineup, editingLineup, canEdit, viewerPlayerId, champions, onEdit }: { slot: RosterSlot; champions: PickerChampion[]; championsById: Map<string, { id: string; name: string; portraitUrl: string }>; canManageLineup: boolean; editingLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const p = slot.player;
  const accent = ACCENT_COLOR[p?.cardAccent ?? "default"];
  const champ = (id: string) => championsById.get(id) ?? { id, name: id, portraitUrl: "" };
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

  return (
    <article className={cn("rise-in group/card relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface transition-colors", editingLineup ? "border-accent/50" : "border-border hover:border-border-strong")} style={{ ["--card-accent" as string]: accent }} data-testid={`lineup-row-${slot.role}`} data-player-id={p?.id} data-player-name={p?.name} data-off-role={p ? offRole(p) : undefined}>
      <div className="relative h-32 shrink-0 overflow-hidden sm:h-36 [&_.card-art-img]:group-hover/card:scale-[1.03] motion-reduce:[&_.card-art-img]:group-hover/card:scale-100" data-testid="card-art">
        {/* Splash of the player's chosen champion and skin, darkened towards the text, tinted with their accent. */}
        <CardArtLayer art={p?.art ?? null} accent={accent} kind="splash" position="center 22%" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-bg/75 px-3 py-1 text-sm font-semibold uppercase tracking-[0.14em] text-fg backdrop-blur-sm" data-testid="assigned-role">
          <span style={{ color: accent }} className="inline-flex">
            <RoleIcon role={slot.role} className="h-4 w-4" />
          </span>{" "}
          {slot.roleLabel}
        </span>
        {/* Over the art, so permissions and edit mode never move anything else on the card. */}
        <span className="absolute right-2.5 top-2.5 flex items-center gap-1">
          {own && !editingLineup ? <CustomiseCardButton variant="icon" playerId={p.id} name={p.name} avatarUrl={p.avatarUrl} art={p.art} accent={p.cardAccent} champions={champions} poolIds={p.poolIds} /> : null}
          {lineupMenu}
        </span>
        {p ? (
          <Link href={`/players/${p.id}`} className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-3 pb-2.5">
            <Avatar name={p.name} src={p.avatarUrl} size="lg" ring="accent" />
            <span className="min-w-0 pb-0.5">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-lg font-semibold leading-tight text-fg drop-shadow">{p.name}</span>
                {p.id === viewerPlayerId ? <Badge tone="accent">You</Badge> : null}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-fg-muted" data-testid="card-fit">
                <RankInline rank={p.rank} />
                {offRole(p) ? (
                  <span className="shrink-0 rounded-full border border-warn/50 bg-warn/15 px-1.5 py-px text-[0.6875rem] font-semibold text-warn" data-testid="off-role-badge" title={`${slot.roleLabel} is not their Primary Role`}>
                    Off Role
                  </span>
                ) : null}
              </span>
            </span>
          </Link>
        ) : null}
      </div>
      {p ? (
        <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3">
          <dl className="grid grid-cols-4 gap-1.5 text-center" data-testid="card-season">
            <div className="rounded-lg bg-bg-elevated px-1 py-1.5">
              <dt className="text-xs text-fg-subtle">Games</dt>
              <dd className="text-base font-semibold tabular-nums text-fg">{p.season?.games ?? 0}</dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-1 py-1.5">
              <dt className="text-xs text-fg-subtle">Win rate</dt>
              <dd className={cn("text-base font-semibold tabular-nums", p.season?.winRate == null ? "text-fg-muted" : p.season.winRate >= 0.5 ? "text-good" : "text-fg")}>{p.season?.winRate == null ? "—" : `${Math.round(p.season.winRate * 100)}%`}</dd>
            </div>
            <div className="rounded-lg bg-bg-elevated px-1 py-1.5">
              <dt className="text-xs text-fg-subtle">KDA</dt>
              <dd className="text-base font-semibold tabular-nums text-fg">{p.season?.kda == null ? "—" : p.season.kda.toFixed(2)}</dd>
            </div>
            {support ? (
              <div className="rounded-lg bg-bg-elevated px-1 py-1.5" title="Average vision score per game in Support games this season (per game, not per minute)">
                <dt className="whitespace-nowrap text-[0.6875rem] leading-4 tracking-tight text-fg-subtle">Avg vision</dt>
                <dd className="text-base font-semibold tabular-nums text-fg" data-testid="card-vision">{p.season?.visionPerGame == null ? "—" : p.season.visionPerGame.toFixed(1)}</dd>
              </div>
            ) : (
              <div className="rounded-lg bg-bg-elevated px-1 py-1.5" title="Creep score per minute: lane minions plus monsters, over the games with both recorded">
                <dt className="text-xs text-fg-subtle">CS/min</dt>
                <dd className="text-base font-semibold tabular-nums text-fg" data-testid="card-cs">{p.season?.csPerMinute == null ? "—" : p.season.csPerMinute.toFixed(1)}</dd>
              </div>
            )}
          </dl>
          {/* The whole pool for the role, one row per champion. Everything above it has a fixed
              size, so the pools start at the same height on every card; a longer pool makes the
              row of cards taller together (never a scrollbar inside a card). */}
          <div className="flex flex-1 flex-col border-t border-border pt-2">
            <div className="flex h-7 items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-subtle">
                {slot.roleLabel} pool{slot.champions.length ? ` · ${slot.champions.length}` : ""}
                <span className="sr-only">, in order of preference</span>
              </span>
              {canEdit && p.poolSlot ? (
                <button type="button" onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-md text-fg-subtle hover:bg-accent/10 hover:text-accent pointer-coarse:h-9 pointer-coarse:w-9" aria-label={`Edit ${p.name}'s ${slot.roleLabel} champions`} title="Edit champions" data-testid="edit-roster-champions">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {slot.champions.length === 0 ? (
              <p className="mt-1 flex min-h-12 items-center text-sm text-warn">No {slot.roleLabel} champions yet.</p>
            ) : (
              <ol className="mt-1 divide-y divide-border/60" data-testid="pool-preview" aria-label={`${slot.roleLabel} champion pool, in order of preference`}>
                {slot.champions.map((c, i) => {
                  const ch = champ(c.championId);
                  return (
                    <li key={c.championId} className="flex min-h-12 items-center gap-2.5 py-1.5" data-testid="pool-champion" data-champion={c.championId}>
                      <span className="w-3 shrink-0 text-right text-[0.6875rem] font-semibold tabular-nums text-fg-subtle" aria-hidden>
                        {i + 1}
                      </span>
                      <ChampionPortrait champion={ch} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{ch.name}</span>
                        <span className="mt-0.5 block">
                          <TierBadge tier={c.tier as ProficiencyTier} label={c.tierLabel} why={c.tierWhy} evidence={c.evidence} compact />
                        </span>
                      </span>
                      <span className="shrink-0 text-right leading-tight" data-testid="pool-champion-stats" title={c.masteryPoints ? `${c.masteryPoints.toLocaleString("en")} mastery points` : undefined}>
                        {c.games ? (
                          <>
                            <span className={cn("block text-sm font-semibold tabular-nums", c.winRate !== null && c.winRate >= 0.5 ? "text-good" : "text-fg")}>{c.winRate === null ? "—" : `${Math.round(c.winRate * 100)}%`}</span>
                            <span className="block text-[0.6875rem] tabular-nums text-fg-subtle">
                              {c.games} game{c.games === 1 ? "" : "s"}
                            </span>
                            {support ? (
                              <span className="block text-[0.6875rem] tabular-nums text-fg-muted" data-testid="pool-champion-kda-vision" title={c.visionPerGame === null ? "Vision score is not available: these games' details were not collected" : "Average vision score per game"}>
                                {c.perfectKda ? "Perfect" : c.kdaRatio === null ? "—" : c.kdaRatio.toFixed(1)} KDA · {c.visionPerGame === null ? "—" : Math.round(c.visionPerGame)} vis
                              </span>
                            ) : (
                              <span className="block text-[0.6875rem] tabular-nums text-fg-muted" data-testid="pool-champion-kda-cs" title={c.csPerMinute === null ? "CS/min is not available: these games' details were not collected" : "CS per minute"}>
                                {c.perfectKda ? "Perfect" : c.kdaRatio === null ? "—" : c.kdaRatio.toFixed(1)} KDA · {c.csPerMinute === null ? "—" : c.csPerMinute.toFixed(1)} CS
                              </span>
                            )}
                          </>
                        ) : (
                          c.masteryPoints ? (
                          <>
                            <span className="block text-sm font-semibold tabular-nums text-fg-muted">{compactPoints(c.masteryPoints)}</span>
                            <span className="block text-[0.6875rem] text-fg-subtle">mastery</span>
                          </>
                        ) : (
                          <span className="block text-[0.6875rem] text-fg-subtle">No games</span>
                        )
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
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

/**
 * OUR TEAM: the page header and the main lineup as five player cards. Two separate actions:
 * "Edit lineup" (lineup managers only) switches every card into a mode with a Change/Assign
 * control; your own card's brush personalises its look. Players edit their own champions in place.
 */
export function TeamRoster({ slots, complete, champions, canManageLineup, editablePlayerIds, viewerPlayerId }: { slots: RosterSlot[]; complete: boolean; champions: PickerChampion[]; canManageLineup: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null }) {
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [editingLineup, setEditingLineup] = React.useState(false);
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const editable = new Set(editablePlayerIds);
  const editingSlot = slots.find((s) => s.role === editing && s.player);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <PageHeader
        title="Team"
        description={editingLineup ? "Editing the lineup: use Change on a card to put another player in that role." : "Our main lineup: who plays each role and what they bring to it."}
        actions={
          canManageLineup ? (
            <Button variant={editingLineup ? "primary" : "outline"} onClick={() => setEditingLineup((v) => !v)} aria-pressed={editingLineup} data-testid="edit-lineup">
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
          ) : null
        }
      />
      {/* The lineup is the centre of the page: vertically centred in the space under the header,
          five across when its own width allows (sized to the content area, so an open or closed
          sidebar is accounted for), else balanced rows of three or two with the last row centred,
          and one per row on phones. Cards never shrink below a readable width. */}
      <div className="flex flex-1 flex-col justify-center gap-5 py-2 lg:py-6">
      <div className="@container" data-testid="lineup-frame">
        {/* A grid of half-width tracks: every row shares one height (auto-rows-fr) and a short last
            row is centred by starting it half a card in (2 + 2 + 1, or 3 + 2). */}
        <div
          className={cn(
            "mx-auto grid max-w-[26rem] auto-rows-fr grid-cols-1 gap-3",
            "@xl:max-w-[54rem] @xl:grid-cols-4 @xl:[&>*]:col-span-2 @xl:[&>*:nth-child(5)]:col-start-2",
            "@4xl:max-w-[80rem] @4xl:grid-cols-6 @4xl:[&>*:nth-child(4)]:col-start-2 @4xl:[&>*:nth-child(5)]:col-start-auto",
            "@7xl:max-w-[118rem] @7xl:grid-cols-5 @7xl:[&>*]:col-span-1 @7xl:[&>*:nth-child(4)]:col-start-auto",
          )}
          data-testid="lineup-overview"
        >
          {slots.map((s) => (
            <div key={s.role} className="flex min-w-0" data-testid="lineup-cell">
              <RosterCard slot={s} champions={champions} championsById={championsById} canManageLineup={canManageLineup} editingLineup={editingLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onEdit={() => setEditing(s.role)} />
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[118rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          {complete ? "Lineup complete. Roles can still be flexed during the draft." : canManageLineup ? "Assign all five roles to start drafting." : "A lineup manager assigns the five roles."}
          <InfoTip text="Each card is about the role the player holds in this lineup: its figures count this season's supported games (Ranked Solo/Duo, Ranked Flex, Normal games) played in that role, on any champion, from their linked Riot accounts; the champions are their whole pool for that role, in order of preference; the tags describe their experience in that role. Hover a tag for the evidence behind it." />
        </p>
        <Link href="/draft" className={buttonClass("primary", "lg", cn("w-full sm:w-auto", !complete && "pointer-events-none opacity-50"))} aria-disabled={!complete}>
          <Swords className="h-4 w-4" /> Start a draft
        </Link>
      </div>
      </div>
      {editingSlot && champions.length > 0 ? <RosterPoolDialog slot={editingSlot} champions={champions} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
