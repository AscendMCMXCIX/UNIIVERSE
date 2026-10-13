"use client";

import { useActionState } from "react";
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
      <p className="text-[11px] text-fg-subtle">Signed-in devices stay signed in for 30 days. Forgot your password? The owner can reset it from Settings → Team members.</p>
    </form>
  );
}
