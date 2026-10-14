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
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
        <p className="mt-1 text-[11px] text-fg-subtle">New player? Use the temporary password from your admin; you choose your own right after.</p>
      </div>
      {state?.error ? (
        <p className="text-sm text-bad" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-[11px] text-fg-subtle">
        You stay signed in for 24 hours, then sign in again. Forgot your password? Ask an admin to reset it: you get a temporary one. Owners who lost theirs:{" "}
        <Link href="/recover" className="text-accent underline-offset-2 hover:underline">
          owner recovery
        </Link>{" "}
        with the setup key.
      </p>
    </form>
  );
}
