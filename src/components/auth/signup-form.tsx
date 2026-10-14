"use client";

import { useActionState } from "react";
import type { FormState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { RiotAccountsFields } from "./riot-accounts-fields";
import { RoleFields } from "./role-fields";

type SignupAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/**
 * One coherent account-creation form: username, Riot accounts, roles and (optionally) a
 * password. Used by the first-run owner setup and by invite links; the server action creates
 * the account, the player profile and the Riot accounts together.
 */
export function SignupForm({ action, kind, token, needsKey = false, defaultPlatform, suggestedUsername = "" }: { action: SignupAction; kind: "owner" | "invite"; token?: string; needsKey?: boolean; defaultPlatform: string; suggestedUsername?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const v = state?.values ?? {};
  const passwordRequired = kind === "owner";
  return (
    <form action={formAction} className="mt-4 space-y-4">
      {token ? <input type="hidden" name="token" value={token} /> : null}
      {kind === "invite" ? <input type="hidden" name="mode" value="new" /> : null}
      <div>
        <Label htmlFor="username">USERNAME *</Label>
        <Input id="username" name="username" defaultValue={v.username || suggestedUsername} required minLength={2} maxLength={32} autoComplete="username" autoFocus spellCheck={false} />
        <p className="mt-1 text-[11px] text-fg-subtle">How teammates see you in UNIIVERSE, and what you sign in with.</p>
      </div>
      <RiotAccountsFields defaultPlatform={v.platform || defaultPlatform} initial={v.riotId ? { primary: { riotId: v.riotId, platform: v.platform || defaultPlatform }, extras: (v.extraRiotIds || "").split("\n").filter(Boolean).map((riotId, i) => ({ riotId, platform: (v.extraPlatforms || "").split("\n")[i] || v.platform || defaultPlatform })) } : undefined} />
      <RoleFields initialPrimary={(v.primaryRole as "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT") || null} initialSecondary={(v.secondaryRole as "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT") || null} />
      <div>
        <Label htmlFor="password">{passwordRequired ? "PASSWORD *" : "PASSWORD (optional)"}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required={passwordRequired} minLength={passwordRequired ? 10 : undefined} />
        <p className="mt-1 text-[11px] text-fg-subtle">{passwordRequired ? "6+ characters with a number and a symbol. The owner account always has one." : "6+ characters with a number and a symbol. Skip it for now and you stay signed in on this device; set one under My profile before signing in elsewhere. No email is used anywhere."}</p>
      </div>
      {needsKey ? (
        <div>
          <Label htmlFor="setupKey">Setup key (the UNIIVERSE_ACCESS_PASSWORD value you configured)</Label>
          <Input id="setupKey" name="setupKey" type="password" required />
        </div>
      ) : null}
      {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Creating…" : kind === "owner" ? "Create owner account" : "Create account"}
      </Button>
    </form>
  );
}
