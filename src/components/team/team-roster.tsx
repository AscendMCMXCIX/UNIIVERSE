"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Pencil, Swords, UserPlus } from "lucide-react";
import type { Role } from "@/domain/roles";
import type { RosterChampion, RosterSlot } from "@/server/team/roster";
import { setLineupSlotAction } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionPortrait } from "@/components/champion-portrait";
import { RoleIcon } from "@/components/role-icon";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { InfoTip } from "@/components/ui/info-tip";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { toast } from "@/components/ui/toast";
import { PoolSection } from "@/components/profile/profile-editor";
import { useProfileAutosave } from "@/components/profile/use-profile-autosave";
import { cn } from "@/lib/cn";

const TIER_TONE: Record<string, "good" | "info" | "neutral" | "warn"> = { core: "good", strong: "good", comfortable: "info", moderate: "neutral", rusty: "warn", unknown: "neutral" };

function compactPoints(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function ChampionLine({ c, champion }: { c: RosterChampion; champion: { id: string; name: string; portraitUrl: string } }) {
  return (
    <li className="flex items-center gap-2.5" data-testid="roster-champion">
      <ChampionPortrait champion={champion} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-fg">{champion.name}</span>
          <Badge tone={TIER_TONE[c.tier] ?? "neutral"}>{c.tierLabel}</Badge>
        </div>
        <div className="truncate text-xs text-fg-muted">
          {c.games > 0 ? (
            <>
              <span className="text-fg">{c.games}</span> games · <span className="text-fg">{Math.round((c.winRate ?? 0) * 100)}%</span> WR
            </>
          ) : (
            "No games this season"
          )}
          {c.masteryPoints ? <> · {compactPoints(c.masteryPoints)} pts</> : null}
        </div>
      </div>
    </li>
  );
}

/** One slot as a card: role, player picture and rank, then the champions they bring with season figures. */
function RosterCard({ slot, championsById, canManageLineup, canEdit, viewerPlayerId, onEdit }: { slot: RosterSlot; championsById: Map<string, { id: string; name: string; portraitUrl: string }>; canManageLineup: boolean; canEdit: boolean; viewerPlayerId: string | null; onEdit: () => void }) {
  const router = useRouter();
  const [menu, setMenu] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [subs, setSubs] = React.useState(false);
  const p = slot.player;
  const assign = async (playerId: string | null) => {
    setBusy(true);
    const r = await setLineupSlotAction(slot.role, playerId);
    setBusy(false);
    setMenu(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(playerId ? `${slot.roleLabel} updated.` : `${slot.roleLabel} cleared.`);
    router.refresh();
  };
  const candidates = slot.candidates.filter((c) => subs || c.group === "main");
  return (
    <article className="rise-in group/card relative flex min-w-0 flex-col rounded-2xl border border-border bg-gradient-to-b from-surface-2/70 to-surface p-4 transition-colors hover:border-border-strong" data-testid={`lineup-row-${slot.role}`}>
      <header className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-fg-muted">
          <RoleIcon role={slot.role} className="h-5 w-5 text-accent" /> {slot.roleLabel}
        </span>
        {canManageLineup ? (
          <div className="relative">
            <Button size="sm" variant="ghost" onClick={() => setMenu((m) => !m)} disabled={busy} aria-expanded={menu} aria-label={`${p ? "Change" : "Assign"} ${slot.roleLabel} player`}>
              {p ? "Change" : "Assign"} <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {menu ? (
              <div className="rise-in absolute right-0 top-full z-30 mt-1 w-[min(17rem,calc(100vw-2rem))] rounded-lg border border-border-strong bg-bg-elevated p-1 shadow-2xl" role="menu">
                {candidates.length === 0 ? <div className="px-3 py-2 text-xs text-fg-muted">No {subs ? "" : "main "}player lists {slot.roleLabel}.</div> : null}
                {candidates.map((c) => (
                  <button key={c.id} type="button" role="menuitem" onClick={() => assign(c.id)} className={cn("flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm hover:bg-surface-2 md:min-h-9", c.id === p?.id && "text-accent")}>
                    <span>{c.name}</span>
                    <span className="text-xs text-fg-subtle">{c.group === "other" ? "substitute" : c.fit}</span>
                  </button>
                ))}
                <label className="mt-1 flex min-h-11 items-center gap-2 border-t border-border px-3 text-xs text-fg-muted md:min-h-9">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--color-accent)]" checked={subs} onChange={(e) => setSubs(e.target.checked)} /> Include substitutes
                </label>
                {p ? (
                  <button type="button" role="menuitem" onClick={() => assign(null)} className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-xs text-fg-muted hover:bg-surface-2 md:min-h-9">
                    Clear this role
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      {p ? (
        <>
          <Link href={`/players/${p.id}`} className="mt-3 flex items-center gap-3 rounded-xl py-1 hover:bg-surface-2/40 sm:mt-4 sm:flex-col sm:gap-2 sm:text-center">
            <Avatar name={p.name} src={p.avatarUrl} size="hero" ring="accent" />
            <span className="min-w-0">
              <span className="block max-w-full truncate text-lg font-semibold text-fg">{p.name}</span>
              <span className="block min-h-5 text-xs text-fg-muted">{p.rank ?? "Unranked"}</span>
            </span>
          </Link>
          <div className="mt-1 flex flex-wrap gap-1 empty:hidden sm:min-h-6 sm:justify-center sm:empty:flex">
            {p.id === viewerPlayerId ? <Badge tone="accent">You</Badge> : null}
            {p.profileRole === "secondary" ? <Badge tone="warn">Secondary role</Badge> : null}
            {p.profileRole === "other" ? <Badge tone="warn">Out of role</Badge> : null}
            {p.substitute ? <Badge tone="neutral">Substitute</Badge> : null}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 sm:mt-4">
            <span className="text-xs font-medium text-fg-subtle">
              Champions · {p.seasonLabel}
              {p.partial ? " (partial)" : ""}
            </span>
            {canEdit && p.poolSlot ? (
              <button type="button" onClick={onEdit} className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:bg-accent/10" data-testid="edit-roster-champions">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            ) : null}
          </div>
          {slot.champions.length === 0 ? (
            <p className="mt-2 text-sm text-warn">No {slot.roleLabel} champions yet.</p>
          ) : (
            <ul className="mt-2 space-y-2.5">
              {slot.champions.map((c) => (
                <ChampionLine key={c.championId} c={c} champion={championsById.get(c.championId) ?? { id: c.championId, name: c.championId, portraitUrl: "" }} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-fg-subtle">
          <span className="grid h-20 w-20 place-items-center rounded-full border border-dashed border-border-strong">
            <UserPlus className="h-6 w-6" aria-hidden />
          </span>
          {canManageLineup ? "Assign a player" : "Not assigned yet"}
        </div>
      )}
    </article>
  );
}

/** Edit the champions a player brings to their lineup role, without leaving the Team page. */
function RosterPoolDialog({ slot, champions, limits, onClose }: { slot: RosterSlot; champions: PickerChampion[]; limits: { primary: number; secondary: number }; onClose: () => void }) {
  const router = useRouter();
  const p = slot.player!;
  const { state, status, error, update, retry } = useProfileAutosave(p.id, p.profile, p.version);
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const slotKey = p.poolSlot === "secondary" ? "secondaryPool" : "primaryPool";
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
      <PoolSection title={`${p.poolSlot === "secondary" ? "Secondary" : "Primary"} champions`} role={slot.role as Role} ids={state[slotKey]} limit={p.poolSlot === "secondary" ? limits.secondary : limits.primary} champions={champions} championsById={championsById} onChange={(ids) => update({ [slotKey]: ids })} editable testId="roster-pool" />
    </Dialog>
  );
}

/** OUR TEAM: the main lineup as five player cards; lineup managers change who plays, players edit their own champions in place. */
export function TeamRoster({ slots, complete, champions, limits, canManageLineup, editablePlayerIds, viewerPlayerId }: { slots: RosterSlot[]; complete: boolean; champions: PickerChampion[]; limits: { primary: number; secondary: number }; canManageLineup: boolean; editablePlayerIds: string[]; viewerPlayerId: string | null }) {
  const [editing, setEditing] = React.useState<Role | null>(null);
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const editable = new Set(editablePlayerIds);
  const editingSlot = slots.find((s) => s.role === editing && s.player);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" data-testid="lineup-overview">
        {slots.map((s) => (
          <RosterCard key={s.role} slot={s} championsById={championsById} canManageLineup={canManageLineup} canEdit={!!s.player && editable.has(s.player.id)} viewerPlayerId={viewerPlayerId} onEdit={() => setEditing(s.role)} />
        ))}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-sm text-fg-muted">
          {complete ? "Lineup complete. Roles can still be flexed during the draft." : canManageLineup ? "Assign all five roles to start drafting." : "An admin assigns the five roles."}
          <InfoTip text="Games and win rate count every supported game this season (Ranked Solo/Duo, Ranked Flex, Normal games) on the player's linked Riot accounts. Mastery points are summed over those accounts. Proficiency is UNIIVERSE's estimate from volume, recency and results; pools decide what can be drafted." />
        </p>
        <Link href="/draft" className={buttonClass("primary", "lg", cn("w-full sm:w-auto", !complete && "pointer-events-none opacity-50"))} aria-disabled={!complete}>
          <Swords className="h-4 w-4" /> Start a draft
        </Link>
      </div>
      {editingSlot && champions.length > 0 ? <RosterPoolDialog slot={editingSlot} champions={champions} limits={limits} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
