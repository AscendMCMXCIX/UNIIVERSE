"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

/**
 * The sign-in form. `preview` (Admin → Previews) keeps everything the same on screen but sends
 * nothing: submitting only says so.
 */
export function LoginForm({ next, preview = false, onPreviewSignIn, add = false }: { next: string; preview?: boolean; onPreviewSignIn?: (username: string, password: string) => string | null; add?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  // Another account was added: load the app afresh (a full page load), so nothing of the
  // previous account's pages stays in this tab.
  const switchTo = state && "switchTo" in state ? state.switchTo : null;
  React.useEffect(() => {
    if (switchTo) window.location.replace(switchTo);
  }, [switchTo]);
  const [previewNote, setPreviewNote] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  return (
    <form
      action={preview ? undefined : action}
      onSubmit={
        preview
          ? (e) => {
              e.preventDefault();
              // Admin → Previews: nothing is sent. The onboarding preview checks the mock account instead.
              if (!onPreviewSignIn) return setPreviewNote(true);
              const form = new FormData(e.currentTarget);
              setPreviewError(onPreviewSignIn(String(form.get("username") ?? ""), String(form.get("password") ?? "")));
            }
          : undefined
      }
      className="mt-5 space-y-3"
      data-testid="login-form"
    >
      <input type="hidden" name="next" value={next} />
      {add ? <input type="hidden" name="add" value="1" /> : null}
      <div>
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete={preview ? "off" : "username"} autoFocus={!preview} required defaultValue={state?.values?.username ?? ""} spellCheck={false} autoCapitalize="none" />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete={preview ? "off" : "current-password"} required />
        <p className="mt-1 text-xs text-fg-subtle">New player? Use the temporary password from your admin; you choose your own right after.</p>
      </div>
      {state?.error || previewError ? (
        <p className="text-sm text-bad" role="alert">
          {state?.error ?? previewError}
        </p>
      ) : null}
      {previewNote ? (
        <p className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-sm text-fg" role="status" data-testid="preview-note">
          Preview: nothing was sent. On the real page this signs the person in.
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending || !!switchTo}>
        {pending || switchTo ? "Signing in…" : add ? "Add account" : "Sign in"}
      </Button>
      <p className="text-xs text-fg-subtle">
        You stay signed in for 24 hours, then sign in again. Forgot your password? Ask an admin to reset it: you get a temporary one. Owners who lost theirs:{" "}
        <Link href={preview ? "#" : "/recover"} className="text-accent underline-offset-2 hover:underline">
          owner recovery
        </Link>{" "}
        with the setup key.
      </p>
    </form>
  );
}
