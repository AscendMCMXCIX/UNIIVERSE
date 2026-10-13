"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/domain/roles";
import { completeProfileAction } from "@/server/actions/users";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { RiotAccountsFields, type RiotRow } from "./riot-accounts-fields";
import { RoleFields } from "./role-fields";

/** Asks an account created before automatic profiles for the missing details, once. */
export function CompleteProfileForm({ defaultPlatform }: { defaultPlatform: string }) {
  const router = useRouter();
  const [accounts, setAccounts] = React.useState<{ primary: RiotRow; extras: RiotRow[] }>({ primary: { riotId: "", platform: defaultPlatform }, extras: [] });
  const [roles, setRoles] = React.useState<{ primaryRole: Role | null; secondaryRole: Role | null }>({ primaryRole: null, secondaryRole: null });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roles.primaryRole) return setError("Choose your main role.");
    setBusy(true);
    setError(null);
    const r = await completeProfileAction({ riotId: accounts.primary.riotId, platform: accounts.primary.platform, extraRiot: accounts.extras, primaryRole: roles.primaryRole, secondaryRole: roles.secondaryRole });
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  };
  return (
    <Panel className="border-accent/50">
      <PanelHeader title="COMPLETE YOUR PLAYER PROFILE" subtitle="Your account predates automatic player profiles. Add your Riot ID and main role once; your profile is created and linked immediately." />
      <PanelBody>
        <form onSubmit={submit} className="space-y-4">
          <RiotAccountsFields defaultPlatform={defaultPlatform} onChange={setAccounts} />
          <RoleFields onChange={setRoles} />
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Creating…" : "Create my player profile"}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}
