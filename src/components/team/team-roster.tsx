"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Sparkles, Swords, TrendingUp, UserPlus, X } from "lucide-react";
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
import { cn } from "@/lib/cn";


function TagChip({ tag, accent }: { tag: PlayerTag; accent: string }) {
  return (
    <li className="inline-flex max-w-full" data-testid="strength-tag" data-kind={tag.kind}>
      <span
        title={tag.reason}
        className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2.5 py-0.5 text-xs font-medium", tag.kind === "neutral" ? "border-border text-fg-muted" : "text-fg")}
        style={tag.kind === "neutral" ? undefined : { borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}
      >
        {tag.kind === "performance" ? <TrendingUp className="h-3 w-3 shrink-0" aria-hidden /> : tag.kind === "playstyle" ? <Sparkles className="h-3 w-3 shrink-0" aria-hidden /> : null}
        <span className="truncate">{tag.label}</span>
        <span className="sr-only">: {tag.reason}</span>
      </span>
    </li>
  );
}

/**
 * One lineup slot as a player card. Every card has the same structure and height: splash art of
 * the player's featured champion (under a gradient so text stays readable), identity, up to
 * three strength tags, this season's figures and the whole pool for the role (long pools scroll
 * inside a fixed area). Lineup managers change who plays; players edit their own champions in
 * place and customise their own card.
 */
function RosterCard({ slot, champions, championsById, canManageLineup, canEdit, viewerPlayerId, onEdit }: { slot: RosterSlot; champions: PickerChampion[]; championsById: Map<string, { id: string; name: string; portraitUrl: string }>; canManageLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onEdit: () => void }) {
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
  const menuEl = canManageLineup ? (
    <Menu
      label={`${slot.roleLabel} player`}
      className="w-[min(17rem,calc(100vw-2rem))]"
      testId={`lineup-menu-${slot.role}`}
      trigger={(t) => (
        <Button {...t} size="sm" variant="ghost" className="bg-bg/60 backdrop-blur-sm" disabled={busy} aria-label={`${p ? "Change" : "Assign"} ${slot.roleLabel} player`}>
          {p ? "Change" : "Assign"} <ChevronDown className="h-3.5 w-3.5" />
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
    <article className="rise-in group/card relative flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-border-strong" style={{ ["--card-accent" as string]: accent }} data-testid={`lineup-row-${slot.role}`}>
      <div className="relative h-32 shrink-0 overflow-hidden sm:h-36 [&_.card-art-img]:group-hover/card:scale-[1.03] motion-reduce:[&_.card-art-img]:group-hover/card:scale-100" data-testid="card-art">
        {/* Splash of the player's chosen champion and skin, darkened towards the text, tinted with their accent. */}
        <CardArtLayer art={p?.art ?? null} accent={accent} kind="splash" position="center 22%" />
        <div className="relative flex items-start justify-between gap-2 p-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bg/70 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-fg backdrop-blur-sm">
            <span style={{ color: accent }} className="inline-flex">
              <RoleIcon role={slot.role} className="h-4 w-4" />
            </span>{" "}
            {slot.roleLabel}
          </span>
          <span className="flex items-center gap-1">
            {own ? <CustomiseCardButton playerId={p.id} name={p.name} avatarUrl={p.avatarUrl} art={p.art} accent={p.cardAccent} champions={champions} poolIds={p.poolIds} /> : null}
            {menuEl}
          </span>
        </div>
        {p ? (
          <Link href={`/players/${p.id}`} className="absolute inset-x-0 bottom-0 flex items-end gap-3 px-3 pb-2.5">
            <Avatar name={p.name} src={p.avatarUrl} size="lg" ring="accent" />
            <span className="min-w-0 pb-0.5">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-lg font-semibold leading-tight text-fg drop-shadow">{p.name}</span>
                {p.id === viewerPlayerId ? <Badge tone="accent">You</Badge> : null}
              </span>
              <span className="block truncate text-xs text-fg-muted">
                {p.rank ?? "Unranked"}
                {p.profileRole === "primary" ? " · Main role" : ""}
              </span>
            </span>
          </Link>
        ) : null}
      </div>
      {p ? (
        <div className="flex flex-1 flex-col gap-2.5 px-3.5 pb-3.5 pt-2.5">
          {/* Only when it matters: playing off their main role, or as a substitute. */}
          {p.profileRole !== "primary" || p.substitute ? (
            <div className="flex flex-wrap items-center gap-1">
              {p.profileRole === "secondary" ? <Badge tone="warn">Secondary role</Badge> : null}
              {p.profileRole === "additional" ? <Badge tone="warn">Extra role</Badge> : null}
              {p.profileRole === "other" ? <Badge tone="warn">Out of role</Badge> : null}
              {p.substitute ? <Badge tone="neutral">Substitute</Badge> : null}
              {p.profileRole !== "primary" ? (
                <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                  prefers <RoleIcon role={p.primaryRole} className="h-3.5 w-3.5" /> {ROLE_LABELS[p.primaryRole]}
                </span>
              ) : null}
            </div>
          ) : null}
          <ul className="flex min-h-[3.75rem] flex-wrap content-start gap-1.5" aria-label="Strengths" data-testid="strength-tags">
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
          <div className="mt-auto border-t border-border pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-subtle">
                {slot.roleLabel} pool · {slot.champions.length} champion{slot.champions.length === 1 ? "" : "s"}
                {slot.champions.length > 6 ? <span className="text-fg-subtle/80"> · scroll</span> : null}
              </span>
              {canEdit && p.poolSlot ? (
                <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10" data-testid="edit-roster-champions">
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
              ) : null}
            </div>
            {slot.champions.length === 0 ? (
              <p className="mt-1.5 text-sm text-warn">No {slot.roleLabel} champions yet.</p>
            ) : (
              // The whole pool for this role, in place: two columns of portraits with names. Pools
              // longer than three rows scroll inside this fixed area, so every card keeps its height.
              <ul className="mt-1.5 grid h-[6.5rem] grid-cols-2 content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]" data-testid="pool-full" aria-label={`${slot.roleLabel} champions`} tabIndex={slot.champions.length > 6 ? 0 : undefined}>
                {slot.champions.map((c) => {
                  const ch = champ(c.championId);
                  return (
                    <li key={c.championId} className="flex min-w-0 items-center gap-1.5 rounded-md bg-bg-elevated/70 py-0.5 pl-0.5 pr-1.5" title={`${ch.name} · ${c.tierLabel}${c.games ? ` · ${c.games} game${c.games === 1 ? "" : "s"}${c.winRate !== null ? `, ${Math.round(c.winRate * 100)}% won` : ""}` : ""}`} data-testid="pool-champion">
                      <ChampionPortrait champion={ch} size="xs" />
                      <span className="min-w-0 truncate text-xs text-fg">{ch.name}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-1" data-testid={`vacancy-${slot.role}`}>
          <div className="flex items-center gap-3 text-sm text-fg-subtle">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-dashed border-border-strong">
              <UserPlus className="h-5 w-5" aria-hidden />
            </span>
            {canManageLineup ? "No player yet" : "Not assigned yet"}
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-fg-subtle">Suggested</p>
            {slot.suggestions.length === 0 ? (
              <p className="mt-1 text-sm text-fg-muted">No registered player lists {slot.roleLabel} as a role.{canManageLineup ? " Add one in Admin → Players & Accounts." : ""}</p>
            ) : (
              <ul className="mt-1.5 space-y-2" data-testid="lineup-suggestions">
                {slot.suggestions.map((sg) => (
                  <li key={sg.playerId} className="rounded-lg border border-border bg-surface/60 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Link href={`/players/${sg.playerId}`} className="min-w-0 truncate font-medium text-fg hover:underline">
                          {sg.name}
                        </Link>
                        {sg.substitute ? <Badge tone="neutral">Substitute</Badge> : null}
                      </span>
                      {canManageLineup ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => assign(sg.playerId)} aria-label={`Assign ${sg.name} to ${slot.roleLabel}`}>
                          Assign
                        </Button>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-fg-muted">{sg.reasons.join(" · ")}</p>
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

/** OUR TEAM: the main lineup as five player cards; lineup managers change who plays, players edit their own champions in place. */
export function TeamRoster({ slots, complete, champions, canManageLineup, editablePlayerIds, viewerPlayerId }: { slots: RosterSlot[]; complete: boolean; champions: PickerChampion[]; canManageLineup: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null }) {
  const [editing, setEditing] = React.useState<Role | null>(null);
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const editable = new Set(editablePlayerIds);
  const editingSlot = slots.find((s) => s.role === editing && s.player);
  return (
    <div className="space-y-4">
      <div className="grid auto-rows-fr items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" data-testid="lineup-overview">
        {slots.map((s) => (
          <RosterCard key={s.role} slot={s} champions={champions} championsById={championsById} canManageLineup={canManageLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onEdit={() => setEditing(s.role)} />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          {complete ? "Lineup complete. Roles can still be flexed during the draft." : canManageLineup ? "Assign all five roles to start drafting." : "An admin assigns the five roles."}
          <InfoTip text="Card figures count this season's supported games (Ranked Solo/Duo, Ranked Flex, Normal games) on the player's pool champions, from their linked Riot accounts. Tags come from proven champion experience and, with enough games, measured performance; hover a tag for the evidence." />
        </p>
        <Link href="/draft" className={buttonClass("primary", "lg", cn("w-full sm:w-auto", !complete && "pointer-events-none opacity-50"))} aria-disabled={!complete}>
          <Swords className="h-4 w-4" /> Start a draft
        </Link>
      </div>
      {editingSlot && champions.length > 0 ? <RosterPoolDialog slot={editingSlot} champions={champions} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
