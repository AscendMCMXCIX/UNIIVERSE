"use client";

import * as React from "react";
import { setPermanentPasswordAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { NewPasswordFields, newPasswordReady } from "@/components/forms/new-password-fields";
import { validatePasswordStrength } from "@/domain/password-policy";

/** First sign-in with a temporary password: choose the permanent one, typed twice. */
export function SetPasswordForm({ username, preview = false, onPreviewSaved }: { username: string; preview?: boolean; onPreviewSaved?: (password: string) => string | null }) {
  const [next, setNext] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Admin → Previews: nothing is sent or changed.
    if (preview) {
      if (!onPreviewSaved) return setError("Preview: nothing was saved. On the real page this sets their password and moves on to the next step.");
      // The same checks the server makes, in the same words; then the preview moves on.
      return setError(next !== confirmValue ? "The two passwords do not match." : (validatePasswordStrength(next) ?? onPreviewSaved(next)));
    }
    startTransition(async () => {
      const r = await setPermanentPasswordAction({ next, confirm: confirmValue });
      if (r && !r.ok) setError(r.error);
    });
  };
  return (
    <form onSubmit={submit} className="mt-4 space-y-3" data-testid="set-password-form">
      {preview ? null : <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />}
      <NewPasswordFields next={next} confirm={confirmValue} onNext={setNext} onConfirm={setConfirmValue} autoFocus />
      {error ? (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || !newPasswordReady(next, confirmValue)}>
        {pending ? "Saving…" : "Save my password"}
      </Button>
    </form>
  );
}
