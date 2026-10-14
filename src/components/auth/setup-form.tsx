"use client";

import * as React from "react";
import { ROLE_LABELS, type Role } from "@/domain/roles";
import { finishSetupAction, saveSetupProgressAction } from "@/server/actions/auth";
import type { PickerChampion } from "@/components/champion-picker";
import { PoolSection } from "@/components/profile/profile-editor";
import { RoleFields } from "@/components/auth/role-fields";
import { Button } from "@/components/ui/button";

export interface SetupValues {
  primaryRole: Role | null;
  primaryPool: string[];
  secondaryRole: Role | null;
  secondaryPool: string[];
}

/**
 * WELCOME TO UNIIVERSE: the first-time setup every new player completes before anything else
 * opens. Username and Riot ID come from the admin. Every change is saved as it happens, so a
 * refresh, a closed tab or signing out resumes exactly here; the server validates again on Finish.
 */
export function SetupForm({ username, riotId, champions, initial, preview = false }: { username: string; riotId: string | null; champions: PickerChampion[]; initial: SetupValues; preview?: boolean }) {
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
    // Admin → Previews: the choices stay in this page only.
    if (preview) return;
    const t = setTimeout(async () => {
      setSaved("saving");
      const r = await saveSetupProgressAction(values);
      setSaved(r.ok ? "saved" : "error");
    }, 500);
    return () => clearTimeout(t);
  }, [values, preview]);

  const ready = !!values.primaryRole && values.primaryPool.length >= 1;
  const finish = () => {
    setError(null);
    if (preview) return setError("Preview: nothing was saved. On the real page this finishes their setup and opens UNIIVERSE.");
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

      {values.primaryRole ? (
        <PoolSection title={`Primary champions · ${ROLE_LABELS[values.primaryRole]} (at least 1)`} role={values.primaryRole} ids={values.primaryPool} champions={champions} championsById={championsById} editable onChange={(ids) => setValues((v) => ({ ...v, primaryPool: ids }))} testId="primary-pool" />
      ) : (
        <p className="text-sm text-fg-subtle">Choose your primary role to pick its champions.</p>
      )}
      {values.secondaryRole ? <PoolSection title={`Secondary champions · ${ROLE_LABELS[values.secondaryRole]} (optional)`} role={values.secondaryRole} ids={values.secondaryPool} champions={champions} championsById={championsById} editable onChange={(ids) => setValues((v) => ({ ...v, secondaryPool: ids }))} testId="secondary-pool" /> : null}

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
