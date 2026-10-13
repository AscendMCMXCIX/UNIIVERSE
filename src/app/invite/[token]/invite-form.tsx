"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/server/actions/auth";
import { SignupForm } from "@/components/auth/signup-form";
import { Button } from "@/components/ui/button";

export function InviteForm({ token, suggestedUsername, defaultPlatform, existingUser }: { token: string; suggestedUsername: string; defaultPlatform: string; existingUser: { label: string; hasPlayer: boolean } | null }) {
  const [state, action, pending] = useActionState(acceptInviteAction, undefined);
  return (
    <div className="mt-2 space-y-5">
      {existingUser ? (
        <form action={action} className="space-y-2 rounded-md border border-border bg-bg-elevated p-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value="existing" />
          <p className="text-sm text-fg-muted">
            You are signed in as <span className="text-fg">{existingUser.label}</span>. Accept with this account?
          </p>
          {state?.error ? <p className="text-xs text-bad">{state.error}</p> : null}
          <Button type="submit" variant="primary" disabled={pending}>
            Accept with current account
          </Button>
        </form>
      ) : null}
      {existingUser ? <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">Or create a new account</div> : null}
      <SignupForm action={acceptInviteAction} kind="invite" token={token} defaultPlatform={defaultPlatform} suggestedUsername={suggestedUsername} />
    </div>
  );
}
