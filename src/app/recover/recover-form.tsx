"use client";

import { useActionState } from "react";
import { recoveryAction } from "@/server/actions/recovery";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function RecoverForm() {
  const [state, action, pending] = useActionState(recoveryAction, undefined);
  const owners = state?.owners ?? [];
  const chosen = owners.length === 1 ? owners[0] : owners.find((o) => o.id === state?.values?.ownerId) ?? null;
  if (state?.step === "choose" && owners.length > 0) {
    return (
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="setupKey" value={state.values?.setupKey ?? ""} />
        <input type="hidden" name="intent" value="recover" />
        <div className="rounded-md border border-accent/40 bg-accent/10 p-3 text-sm">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-fg-subtle">Owner account{owners.length > 1 ? "s" : ""} found</div>
          {owners.map((o) => (
            <label key={o.id} className="mt-1 flex items-start gap-2">
              {owners.length > 1 ? <input type="radio" name="ownerId" value={o.id} defaultChecked={chosen?.id === o.id} className="mt-1 accent-[var(--color-accent)]" /> : <input type="hidden" name="ownerId" value={o.id} />}
              <span>
                <span className="text-xs text-fg-subtle">Username</span> <span className="font-mono text-base font-semibold text-fg">{o.username}</span>
                <span className="block text-xs text-fg-muted">
                  {o.displayName} · {o.hasPassword ? "password set" : "no password yet"} · {o.hasPlayer ? "player profile linked" : "player profile not created yet (you will be asked after signing in)"}
                  {!o.isActive ? " · deactivated (recovery reactivates it)" : ""}
                </span>
              </span>
            </label>
          ))}
          <p className="mt-2 text-xs text-fg-muted">Sign in with this username and your existing password, or change either below. Leave both fields empty to keep everything as it is and sign in now.</p>
        </div>
        <div>
          <Label htmlFor="username">New username (optional)</Label>
          <Input id="username" name="username" defaultValue={state.values?.username ?? ""} placeholder={chosen ? `leave empty to keep ${chosen.username}` : ""} minLength={2} maxLength={32} autoComplete="username" spellCheck={false} />
          <p className="mt-1 text-[11px] text-fg-subtle">2–32 characters: letters, digits, spaces, dots, underscores, hyphens. Case does not matter when signing in.</p>
        </div>
        <div>
          <Label htmlFor="password">{chosen && !chosen.hasPassword ? "New password (required)" : "New password (optional)"}</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required={!!chosen && !chosen.hasPassword} />
          <p className="mt-1 text-[11px] text-fg-subtle">Leave empty to keep your current password. A new one needs 6+ characters with a number and a symbol, and signs out your other devices.</p>
        </div>
        {state.error ? <p className="text-sm text-bad">{state.error}</p> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Apply and sign in"}
        </Button>
      </form>
    );
  }
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="intent" value="reveal" />
      <div>
        <Label htmlFor="setupKey">Setup key (the UNIIVERSE_ACCESS_PASSWORD value in your hosting environment)</Label>
        <Input id="setupKey" name="setupKey" type="password" autoComplete="off" required autoFocus />
      </div>
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Checking…" : "Show the owner account"}
      </Button>
      <p className="text-[11px] text-fg-subtle">Nothing changes at this step: the key only unlocks the next screen, where you see the username and can choose a new username or password.</p>
    </form>
  );
}
