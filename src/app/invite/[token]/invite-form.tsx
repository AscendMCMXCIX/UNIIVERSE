"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function InviteForm({ token, suggestedName, suggestedEmail, existingUser }: { token: string; suggestedName: string; suggestedEmail: string; existingUser: { label: string; hasPlayer: boolean } | null }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);
  return (
    <div className="mt-5 space-y-5">
      {existingUser ? (
        <form action={action} className="space-y-2 rounded-md border border-border bg-bg-elevated p-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value="existing" />
          <p className="text-sm text-fg-muted">
            You are signed in as <span className="text-fg">{existingUser.label}</span>. Accept with this account?
          </p>
          <Button type="submit" variant="primary" disabled={pending}>
            Accept with current account
          </Button>
        </form>
      ) : null}
      <form action={action} className="space-y-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="mode" value="new" />
        <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{existingUser ? "Or create a new account" : "Create your account"}</div>
        <div>
          <Label htmlFor="displayName">Your name</Label>
          <Input id="displayName" name="displayName" defaultValue={state?.values?.displayName || suggestedName} required maxLength={40} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={state?.values?.email || suggestedEmail} autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password (10+ characters, letters and a number)</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        </div>
        {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? "Joining…" : "Join UNIIVERSE"}
        </Button>
      </form>
    </div>
  );
}
