"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABELS, type Role } from "@/domain/roles";
import type { PlayerRecord } from "@/server/repositories/team";
import { createPlayerAction, deletePlayerAction, updatePlayerAction, type PlayerFormInput } from "@/server/actions/players";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionSlot } from "@/components/champion-slot";
import { RoleIcon } from "@/components/role-icon";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { ToggleChip } from "@/components/ui/toggle";

export interface PlayerEditorProps {
  player: PlayerRecord | null;
  champions: PickerChampion[];
  limits: { primary: number; secondary: number };
  canDelete: boolean;
  /** A player editing their own profile: no group changes, returns to /me. */
  selfService?: boolean;
}

function RoleSelect({ value, onChange, allowNone, exclude }: { value: Role | null; onChange: (r: Role | null) => void; allowNone?: boolean; exclude?: Role | null }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowNone ? (
        <ToggleChip active={value === null} onClick={() => onChange(null)}>
          None
        </ToggleChip>
      ) : null}
      {ROLES.map((role) => (
        <ToggleChip key={role} disabled={exclude === role} active={value === role} onClick={() => onChange(role)}>
          <RoleIcon role={role} className="h-4 w-4" /> {ROLE_LABELS[role]}
        </ToggleChip>
      ))}
    </div>
  );
}

function PoolEditor({ title, role, pool, limit, champions, championsById, disabledIds, onChange }: { title: string; role: Role | null; pool: string[]; limit: number; champions: PickerChampion[]; championsById: Map<string, PickerChampion>; disabledIds: Set<string>; onChange: (pool: string[]) => void }) {
  const slots = Array.from({ length: limit }, (_, i) => pool[i] ?? null);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionLabel>
          {title} {role ? `· ${ROLE_LABELS[role]}` : ""}
        </SectionLabel>
        <span className="text-xs text-fg-subtle">
          {pool.length}/{limit}
        </span>
      </div>
      {!role ? (
        <p className="text-xs text-fg-subtle">Choose a role first.</p>
      ) : (
        <div className="flex flex-wrap gap-3 sm:gap-3">
          {slots.map((championId, i) => (
            <ChampionSlot
              key={`${i}-${championId ?? "empty"}`}
              championId={championId}
              champions={champions}
              championsById={championsById}
              disabledIds={disabledIds}
              label={`Add champion ${i + 1}`}
              onChange={(next) => {
                const copy = [...pool];
                if (next === null) copy.splice(i, 1);
                else if (i < copy.length) copy[i] = next;
                else copy.push(next);
                onChange([...new Set(copy)]);
              }}
            />
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-fg-subtle">Order matters: put the player&apos;s most comfortable champions first.</p>
    </div>
  );
}

export function PlayerEditor({ player, champions, limits, canDelete, selfService = false }: PlayerEditorProps) {
  const router = useRouter();
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const [form, setForm] = React.useState<PlayerFormInput>({
    displayName: player?.displayName ?? "",
    riotId: player?.riotId ?? "",
    primaryRole: player?.primaryRole ?? "TOP",
    secondaryRole: player?.secondaryRole ?? null,
    notes: player?.notes ?? "",
    group: player?.group ?? "main",
    primaryPool: player?.primaryPool ?? [],
    secondaryPool: player?.secondaryPool ?? [],
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof PlayerFormInput>(key: K, value: PlayerFormInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: PlayerFormInput = { ...form, secondaryPool: form.secondaryRole ? form.secondaryPool : [] };
    const res = player ? await updatePlayerAction(player.id, payload) : await createPlayerAction(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(selfService ? "/me" : "/team");
    router.refresh();
  };

  const remove = async () => {
    if (!player) return;
    if (!confirm(`Permanently delete ${player.displayName}? Archive instead if they might play again.`)) return;
    const res = await deletePlayerAction(player.id);
    if (!res.ok) setError(res.error);
    else {
      router.push("/players");
      router.refresh();
    }
  };

  const primaryDisabled = new Set<string>(form.primaryPool ?? []);
  const secondaryDisabled = new Set<string>(form.secondaryPool ?? []);

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{player ? (selfService ? "My profile" : `Edit ${player.displayName}`) : "New player"}</h1>
          <p className="text-sm text-fg-muted">Roles and champion pools decide exactly what UNIIVERSE may recommend for this player.</p>
        </div>
        <div className="flex gap-2">
          {player && canDelete ? (
            <Button variant="danger" onClick={remove}>
              Delete
            </Button>
          ) : null}
          <Button variant="primary" type="submit" disabled={saving} className="flex-1 sm:flex-none">
            {saving ? "Saving…" : "Save player"}
          </Button>
        </div>
      </div>
      {error ? <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div> : null}

      <Panel>
        <PanelHeader title="PROFILE" />
        <PanelBody className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} required maxLength={40} />
          </div>

          <div className={selfService ? "hidden" : undefined}>
            <Label>Group</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["main", "other"] as const).map((g) => (
                <ToggleChip key={g} active={form.group === g} onClick={() => set("group", g)}>
                  {g === "main" ? "Main player" : "Other player"}
                </ToggleChip>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Comfort picks, tendencies, anything the drafter should remember." />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="ROLES" subtitle="A player can only ever be assigned their primary or secondary role." />
        <PanelBody className="grid gap-4 md:grid-cols-2">
          <div>
            <Label>Primary role</Label>
            <RoleSelect
              value={form.primaryRole}
              onChange={(r) => {
                if (!r) return;
                set("primaryRole", r);
                if (form.secondaryRole === r) set("secondaryRole", null);
              }}
            />
          </div>
          <div>
            <Label>Secondary role</Label>
            <RoleSelect value={form.secondaryRole ?? null} onChange={(r) => set("secondaryRole", r)} allowNone exclude={form.primaryRole} />
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="CHAMPION POOLS" subtitle={`Up to ${limits.primary} primary and ${limits.secondary} secondary champions (limits adjustable in Settings).`} />
        <PanelBody className="space-y-6">
          <PoolEditor title="Primary pool" role={form.primaryRole} pool={form.primaryPool ?? []} limit={limits.primary} champions={champions} championsById={championsById} disabledIds={primaryDisabled} onChange={(p) => set("primaryPool", p)} />
          <PoolEditor title="Secondary pool" role={form.secondaryRole ?? null} pool={form.secondaryPool ?? []} limit={limits.secondary} champions={champions} championsById={championsById} disabledIds={secondaryDisabled} onChange={(p) => set("secondaryPool", p)} />
        </PanelBody>
      </Panel>
      {/* Phones: the save button travels with the form so a long pool edit never ends with a scroll back up. */}
      <div className="sticky bottom-tabbar z-30 -mx-4 border-t border-border bg-bg-elevated/95 px-4 py-2 backdrop-blur md:hidden [@media(max-height:480px)]:static">
        <Button variant="primary" type="submit" disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save player"}
        </Button>
      </div>
    </form>
  );
}
