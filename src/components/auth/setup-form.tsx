"use client";

import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { finishSetupAction, saveSetupProgressAction } from "@/server/actions/auth";
import type { PickerChampion } from "@/components/champion-picker";
import { ChampionSlot } from "@/components/champion-slot";
import { RoleFields } from "@/components/auth/role-fields";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/panel";

export interface SetupValues {
  primaryRole: Role | null;
  primaryPool: string[];
  secondaryRole: Role | null;
  secondaryPool: string[];
}

function PoolPicker({ title, role, limit, required, champions, championsById, taken, value, onChange }: { title: string; role: Role | null; limit: number; required: boolean; champions: PickerChampion[]; championsById: Map<string, PickerChampion>; taken: Set<string>; value: string[]; onChange: (ids: string[]) => void }) {
  const slots = Array.from({ length: limit }, (_, i) => value[i] ?? null);
  return (
    <div data-testid={required ? "primary-pool" : "secondary-pool"}>
      <div className="mb-1.5 flex items-center justify-between">
        <SectionLabel>
          {title}
          {role ? ` · ${ROLE_LABELS[role]}` : ""}
          {required ? " *" : " (optional)"}
        </SectionLabel>
        <span className="text-xs text-fg-subtle">
          {value.length} of {limit}
          {required ? " · at least 1" : ""}
        </span>
      </div>
      {!role ? (
        <p className="text-xs text-fg-subtle">Choose the role first.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {slots.map((id, i) => (
            <ChampionSlot
              key={`${i}-${id ?? "empty"}`}
              championId={id}
              champions={champions}
              championsById={championsById}
              disabledIds={new Set([...taken].filter((t) => t !== id))}
              onChange={(next) => {
                const copy = [...value];
                if (next) copy[i] = next;
                else copy.splice(i, 1);
                onChange([...new Set(copy.filter(Boolean))].slice(0, limit));
              }}
              label={`Add champion ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * WELCOME TO UNIIVERSE: the first-time setup every new player completes before anything else
 * opens. Username and Riot ID come from the admin. Every change is saved as it happens, so a
 * refresh, a closed tab or signing out resumes exactly here; the server validates again on Finish.
 */
export function SetupForm({ username, riotId, champions, limits, initial }: { username: string; riotId: string | null; champions: PickerChampion[]; limits: { primary: number; secondary: number }; initial: SetupValues }) {
  const [values, setValues] = React.useState<SetupValues>(initial);
  const [saved, setSaved] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const championsById = React.useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);
  const first = React.useRef(true);

  // Autosave, debounced: the server keeps the progress, not the browser.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const t = setTimeout(async () => {
      const r = await saveSetupProgressAction(values);
      setSaved(r.ok ? "saved" : "error");
    }, 500);
    return () => clearTimeout(t);
  }, [values]);

  const taken = new Set([...values.primaryPool, ...values.secondaryPool]);
  const ready = !!values.primaryRole && values.primaryPool.length >= 1;
  const finish = () => {
    setError(null);
    startTransition(async () => {
      const r = await finishSetupAction(values);
      if (r && !r.ok) setError(r.error);
    });
  };

  return (
    <div className="mt-4 space-y-5" data-testid="setup-form">
      <div className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-fg-subtle">Username</span>
          <span className="font-medium text-fg">{username}</span>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-fg-subtle">Riot ID</span>
          <span className="font-medium text-fg">{riotId ?? "linked by your admin"}</span>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">Entered by your admin. Ask them if either is wrong.</p>
      </div>

      <RoleFields
        initialPrimary={initial.primaryRole}
        initialSecondary={initial.secondaryRole}
        onChange={(r) =>
          setValues((v) => ({
            primaryRole: r.primaryRole,
            secondaryRole: r.secondaryRole,
            // A champion stays with the role it was picked for: changing a role clears that role's pool.
            primaryPool: r.primaryRole === v.primaryRole ? v.primaryPool : [],
            secondaryPool: r.secondaryRole === v.secondaryRole ? v.secondaryPool : [],
          }))
        }
      />

      <PoolPicker title="Primary champions" role={values.primaryRole} limit={limits.primary} required champions={champions} championsById={championsById} taken={taken} value={values.primaryPool} onChange={(ids) => setValues((v) => ({ ...v, primaryPool: ids }))} />
      {values.secondaryRole ? <PoolPicker title="Secondary champions" role={values.secondaryRole} limit={limits.secondary} required={false} champions={champions} championsById={championsById} taken={taken} value={values.secondaryPool} onChange={(ids) => setValues((v) => ({ ...v, secondaryPool: ids }))} /> : null}

      {error ? (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="primary" size="lg" className="w-full" disabled={pending || !ready} onClick={finish}>
        {pending ? "Saving…" : "Finish setup"}
      </Button>
      <p className="text-xs text-fg-subtle" aria-live="polite">
        {!ready ? "Choose your primary role and at least one champion to continue. " : ""}
        {saved === "saving" ? "Saving your progress…" : saved === "saved" ? "Progress saved: you can come back to it any time." : saved === "error" ? "Could not save your progress just now; it will be retried with your next change." : ""}
      </p>
    </div>
  );
}
