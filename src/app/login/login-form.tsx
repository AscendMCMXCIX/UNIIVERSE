"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" autoFocus required defaultValue={state?.values?.username ?? ""} spellCheck={false} />
        <p className="mt-1 text-[11px] text-fg-subtle">Not an email. Accounts from before usernames existed use their former display name.</p>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" name="remember" className="accent-[var(--color-accent)]" />
        Remember this device (stay signed in for a year)
      </label>
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-[11px] text-fg-subtle">
        Signed-in devices stay signed in for 30 days. Forgot your username or password? Owners:{" "}
        <Link href="/recover" className="text-accent underline-offset-2 hover:underline">
          owner recovery
        </Link>{" "}
        with the setup key. Members: the owner resets passwords from Settings → Team members.
      </p>
    </form>
  );
}
