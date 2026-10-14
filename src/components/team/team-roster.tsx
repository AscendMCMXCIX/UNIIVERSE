"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Check, Pencil, Sparkles, Swords, TrendingUp, UserPlus, Users, X } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { RosterSlot } from "@/server/team/roster";
import type { PlayerTag } from "@/domain/player-tags";
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


function TagChip({ tag, accent }: { tag: PlayerTag; accent: string }) {
  return (
    <li className="flex min-w-0" data-testid="strength-tag" data-kind={tag.kind}>
      <span
        title={`${tag.label}: ${tag.reason}`}
        className={cn("inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2.5 text-xs font-medium", tag.kind === "neutral" ? "border-border text-fg-muted" : "text-fg")}
        style={tag.kind === "neutral" ? undefined : { borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
      >
        {tag.kind === "performance" ? <TrendingUp className="h-3 w-3 shrink-0" aria-hidden /> : tag.kind === "playstyle" ? <Sparkles className="h-3 w-3 shrink-0" aria-hidden /> : null}
        <span className="truncate">{tag.label}</span>
        <span className="sr-only">: {tag.reason}</span>
      </span>
    </li>
  );
}

/** How many pool champions a Team card previews (in the player's order); the rest are counted. */
/** Where the player stands in this role, in a few words (shown in the card's identity line). */
function fitText(p: NonNullable<RosterSlot["player"]>): string {
  if (p.substitute) return "Substitute";
  return p.profileRole === "primary" ? "Main role" : p.profileRole === "secondary" ? "Secondary role" : p.profileRole === "additional" ? "Extra role" : "Out of role";
}

/**
 * One lineup slot as a player card. Every card has the same fixed structure, so cards line up
 * whatever the player's data: splash art with the identity, a three-line tag area, this season's
 * figures and the first three champions of the role pool with "+N more". Controls never change
 * the layout: personalising (own card) and lineup changes (edit mode) sit over the artwork.
 */
function RosterCard({ slot, championsById, canManageLineup, editingLineup, canEdit, viewerPlayerId, champions, onEdit }: { slot: RosterSlot; champions: PickerChampion[]; championsById: Map<string, { id: string; name: string; portraitUrl: string }>; canManageLineup: boolean; editingLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onEdit: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [subs, setSubs] = React.useState(false);
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
  const candidates = slot.candidates.filter((c) => subs || c.group === "main");
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
        <MenuLabel>{subs ? `Everyone who lists ${slot.roleLabel}` : `Main players for ${slot.roleLabel}`}</MenuLabel>
        {candidates.length === 0 ? <div className="px-3 py-2 text-xs text-fg-muted">No {subs ? "" : "main "}player lists {slot.roleLabel}.</div> : null}
        {candidates.map((c) => (
          <MenuItem key={c.id} onSelect={() => void assign(c.id)} active={c.id === p?.id} hint={c.group === "other" ? "substitute" : c.fit === "additional" ? "extra role" : c.fit}>
            {c.name}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={() => setSubs((v) => !v)} hint={subs ? "on" : "off"}>
          Include substitutes
        </MenuItem>
        {p ? (
          <MenuItem onSelect={() => void assign(null)} icon={<X className="h-4 w-4" />}>
            Clear this role
          </MenuItem>
        ) : null}
      </Menu>
    ) : null;
  const own = !!p && p.id === viewerPlayerId && canEdit;

  return (
    <article className={cn("rise-in group/card relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface transition-colors", editingLineup ? "border-accent/50" : "border-border hover:border-border-strong")} style={{ ["--card-accent" as string]: accent }} data-testid={`lineup-row-${slot.role}`}>
      <div className="relative h-32 shrink-0 overflow-hidden sm:h-36 [&_.card-art-img]:group-hover/card:scale-[1.03] motion-reduce:[&_.card-art-img]:group-hover/card:scale-100" data-testid="card-art">
        {/* Splash of the player's chosen champion and skin, darkened towards the text, tinted with their accent. */}
        <CardArtLayer art={p?.art ?? null} accent={accent} kind="splash" position="center 22%" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-bg/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-fg backdrop-blur-sm">
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
              <span className="block truncate text-xs text-fg-muted" data-testid="card-fit">
                {p.rank ?? "Unranked"} · <span className={p.profileRole === "primary" && !p.substitute ? undefined : "text-warn"}>{fitText(p)}</span>
                {p.profileRole !== "primary" ? ` · prefers ${ROLE_LABELS[p.primaryRole]}` : ""}
              </span>
            </span>
          </Link>
        ) : null}
      </div>
      {p ? (
        <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3">
          {/* Exactly three lines whatever the tags say: long labels truncate (full text on hover and for screen readers). */}
          <ul className="flex h-[5.25rem] flex-col items-start gap-1.5 overflow-hidden" aria-label="Strengths" data-testid="strength-tags">
            {p.tags.slice(0, 3).map((t) => (
              <TagChip key={t.key} tag={t} accent={accent} />
            ))}
          </ul>
          <dl className="grid grid-cols-3 gap-1.5 text-center" data-testid="card-season">
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
          </dl>
          {/* The whole pool for the role. It starts at the same height on every card (everything
              above it has a fixed size); a longer pool makes the row of cards taller together. */}
          <div className="border-t border-border pt-2.5">
            <div className="flex h-7 items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-subtle">
                {slot.roleLabel} pool{slot.champions.length ? ` · ${slot.champions.length}` : ""}
              </span>
              {canEdit && p.poolSlot ? (
                <button type="button" onClick={onEdit} className="grid h-7 w-7 place-items-center rounded-md text-fg-subtle hover:bg-accent/10 hover:text-accent pointer-coarse:h-9 pointer-coarse:w-9" aria-label={`Edit ${p.name}'s ${slot.roleLabel} champions`} title="Edit champions" data-testid="edit-roster-champions">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {slot.champions.length === 0 ? (
              <p className="mt-1.5 flex min-h-[3.75rem] items-center text-sm text-warn">No {slot.roleLabel} champions yet.</p>
            ) : (
              <ol className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-x-1 gap-y-1.5" data-testid="pool-preview" aria-label={`${slot.roleLabel} champion pool, in order of preference`}>
                {slot.champions.map((c, i) => {
                  const ch = champ(c.championId);
                  return (
                    <li key={c.championId} className="flex min-w-0 flex-col items-center gap-1 rounded-lg px-0.5 py-1 transition-colors hover:bg-bg-elevated/70" title={`${i + 1}. ${ch.name} · ${c.tierLabel}${c.games ? ` · ${c.games} ${slot.roleLabel} game${c.games === 1 ? "" : "s"}${c.winRate !== null ? `, ${Math.round(c.winRate * 100)}% won` : ""}` : ""}`} data-testid="pool-champion">
                      <ChampionPortrait champion={ch} size="md" />
                      <span className="w-full truncate text-center text-[11px] leading-tight text-fg-muted">{ch.name}</span>
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
                        {sg.substitute ? <Badge tone="neutral">Substitute</Badge> : null}
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
      <PoolSection title={`${p.poolSlot === "secondary" ? "Secondary" : p.poolSlot === "additional" ? "Additional role" : "Primary"} champions`} role={slot.role as Role} ids={poolOfRole(state, slot.role as Role)} champions={champions} championsById={championsById} onChange={(ids) => update(setPoolOfRole(state, slot.role as Role, ids))} editable testId="roster-pool" />
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
    <div className="space-y-5">
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
      <div className="grid auto-rows-fr items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" data-testid="lineup-overview">
        {slots.map((s) => (
          <RosterCard key={s.role} slot={s} champions={champions} championsById={championsById} canManageLineup={canManageLineup} editingLineup={editingLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onEdit={() => setEditing(s.role)} />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          {complete ? "Lineup complete. Roles can still be flexed during the draft." : canManageLineup ? "Assign all five roles to start drafting." : "A lineup manager assigns the five roles."}
          <InfoTip text="Each card is about the role the player holds in this lineup: its figures count this season's supported games (Ranked Solo/Duo, Ranked Flex, Normal games) played in that role, on any champion, from their linked Riot accounts; the champions are their whole pool for that role, in order of preference; the tags describe their experience in that role. Hover a tag for the evidence behind it." />
        </p>
        <Link href="/draft" className={buttonClass("primary", "lg", cn("w-full sm:w-auto", !complete && "pointer-events-none opacity-50"))} aria-disabled={!complete}>
          <Swords className="h-4 w-4" /> Start a draft
        </Link>
      </div>
      {editingSlot && champions.length > 0 ? <RosterPoolDialog slot={editingSlot} champions={champions} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
