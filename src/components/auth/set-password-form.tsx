"use client";

import * as React from "react";
import { setPermanentPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/** First sign-in with a temporary password: choose the permanent one, typed twice. */
export function SetPasswordForm({ username }: { username: string }) {
  const [next, setNext] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const mismatch = confirmValue.length > 0 && confirmValue !== next;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await setPermanentPasswordAction({ next, confirm: confirmValue });
      if (r && !r.ok) setError(r.error);
    });
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-3" data-testid="set-password-form">
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <div>
        <Label htmlFor="new-password">New password (10+ characters with a number)</Label>
        <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} autoFocus />
      </div>
      <div>
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmValue} onChange={(e) => setConfirmValue(e.target.value)} required minLength={10} aria-invalid={mismatch} />
        {mismatch ? <p className="mt-1 text-xs text-bad">The two passwords do not match.</p> : null}
      </div>
      {error ? (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || !next || next !== confirmValue}>
        {pending ? "Saving…" : "Save my password"}
      </Button>
    </form>
  );
}
