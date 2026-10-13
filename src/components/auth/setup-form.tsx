"use client";

import * as React from "react";
import { useActionState } from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import type { FormState } from "@/server/actions/auth";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionSlot } from "@/components/champion-slot";
import { RoleFields } from "@/components/auth/role-fields";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { SectionLabel } from "@/components/ui/panel";

type SetupAction = (prev: FormState, formData: FormData) => Promise<FormState>;

function PoolPicker({ name, title, role, limit, champions, championsById, taken, value, onChange }: { name: string; title: string; role: Role | null; limit: number; champions: PickerChampion[]; championsById: Map<string, PickerChampion>; taken: Set<string>; value: string[]; onChange: (ids: string[]) => void }) {
  const slots = Array.from({ length: limit }, (_, i) => value[i] ?? null);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <SectionLabel>
          {title}
          {role ? ` · ${ROLE_LABELS[role]}` : ""}
        </SectionLabel>
        <span className="text-xs text-fg-subtle">
          {value.length} of {limit}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((id, i) => (
          <ChampionSlot
            key={i}
            championId={id}
            champions={champions}
            championsById={championsById}
            disabledIds={new Set([...taken].filter((t) => t !== id))}
            onChange={(next) => {
              const copy = [...value];
              if (next) copy[i] = next;
              else copy.splice(i, 1);
              onChange(copy.filter(Boolean).slice(0, limit));
            }}
            label={`Add champion ${i + 1}`}
          />
        ))}
      </div>
      {value.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}

/**
 * WELCOME TO UNIIVERSE: the only form a newly invited player fills in. The admin already
 * entered their username and Riot ID; here they choose roles, champion pools and a password.
 */
export function SetupForm({ action, token, username, riotId, champions, limits, initialPrimaryRole }: { action: SetupAction; token?: string; username: string; riotId: string | null; champions: PickerChampion[]; limits: { primary: number; secondary: number }; initialPrimaryRole?: Role | null }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [roles, setRoles] = React.useState<{ primaryRole: Role | null; secondaryRole: Role | null }>({ primaryRole: initialPrimaryRole ?? null, secondaryRole: null });
  const [primaryPool, setPrimaryPool] = React.useState<string[]>([]);
  const [secondaryPool, setSecondaryPool] = React.useState<string[]>([]);
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const taken = new Set([...primaryPool, ...secondaryPool]);
  const ready = !!roles.primaryRole && primaryPool.length > 0;
  return (
    <form action={formAction} className="mt-4 space-y-5">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-fg-subtle">Username</span>
          <span className="font-medium text-fg">{username}</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-fg-subtle">Riot ID</span>
          <span className="font-medium text-fg">{riotId ?? "to be linked by the admin"}</span>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">Entered by your admin. Ask them if either is wrong.</p>
      </div>

      <RoleFields initialPrimary={initialPrimaryRole ?? null} onChange={setRoles} />

      <PoolPicker name="primaryPool" title="Primary champions" role={roles.primaryRole} limit={limits.primary} champions={champions} championsById={championsById} taken={taken} value={primaryPool} onChange={setPrimaryPool} />
      {roles.secondaryRole ? <PoolPicker name="secondaryPool" title="Secondary champions" role={roles.secondaryRole} limit={limits.secondary} champions={champions} championsById={championsById} taken={taken} value={secondaryPool} onChange={setSecondaryPool} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="setup-password">Password</Label>
          <Input id="setup-password" name="password" type="password" autoComplete="new-password" required minLength={10} placeholder="At least 10 characters, with a number" />
        </div>
        <div>
          <Label htmlFor="setup-confirm">Confirm password</Label>
          <Input id="setup-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} />
        </div>
      </div>
      {state?.error ? (
        <p className="text-sm text-bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || !ready}>
        {pending ? "Saving…" : "Finish setup"}
      </Button>
      {!ready ? <p className="text-xs text-fg-subtle">Choose your primary role and at least one champion to continue.</p> : null}
    </form>
  );
}
