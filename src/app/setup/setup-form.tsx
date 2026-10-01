"use client";

import { useActionState } from "react";
import { setupOwnerAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SetupForm({ needsKey }: { needsKey: boolean }) {
  const [state, action, pending] = useActionState(setupOwnerAction, undefined);
  return (
    <form action={action} className="mt-5 space-y-3">
      <div>
        <Label htmlFor="displayName">Your name</Label>
        <Input id="displayName" name="displayName" required maxLength={40} autoFocus />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">Password (10+ characters, letters and a number)</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </div>
      {needsKey ? (
        <div>
          <Label htmlFor="setupKey">Setup key (the UNIIVERSE_ACCESS_PASSWORD value you configured)</Label>
          <Input id="setupKey" name="setupKey" type="password" required />
        </div>
      ) : null}
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create owner account"}
      </Button>
    </form>
  );
}
