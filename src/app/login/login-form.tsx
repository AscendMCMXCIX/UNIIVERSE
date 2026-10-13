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
        <Input id="username" name="username" autoComplete="username" autoFocus required defaultValue={state?.values?.username ?? ""} spellCheck={false} autoCapitalize="none" />
      </div>
      <div>
        <Label htmlFor="secret">Activation code or password</Label>
        <Input id="secret" name="secret" type="password" autoComplete="one-time-code" required spellCheck={false} autoCapitalize="characters" />
        <p className="mt-1 text-[11px] text-fg-subtle">Players: the code your admin gave you (like ABCD-EFGH-JKMN); it works once. Admins: your password.</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        <input type="checkbox" name="remember" defaultChecked className="accent-[var(--color-accent)]" />
        Remember this device (stay signed in for a year)
      </label>
      {state?.error ? (
        <p className="text-sm text-bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-[11px] text-fg-subtle">
        Without “Remember this device” you stay signed in for 30 days. New device or signed out? Ask an admin for a new activation code. Admins who lost their password:{" "}
        <Link href="/recover" className="text-accent underline-offset-2 hover:underline">
          owner recovery
        </Link>{" "}
        with the setup key.
      </p>
    </form>
  );
}
