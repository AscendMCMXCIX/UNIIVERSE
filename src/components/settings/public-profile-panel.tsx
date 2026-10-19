"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { setMyPublicProfileAction } from "@/server/actions/public-access";
import { PUBLIC_NAME_MAX } from "@/domain/public-name";

/**
 * Settings → Public profile: the member's own choice whether visitors without an account may see
 * who they are on the team's public pages, and under which name. Off until they turn it on; only
 * they can change it.
 */
export function PublicProfilePanel({ on, name, username, siteOn }: { on: boolean; name: string | null; username: string; siteOn: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState(on);
  const [publicName, setPublicName] = React.useState(name ?? "");
  const [busy, setBusy] = React.useState(false);
  const save = async (next: boolean) => {
    setBusy(true);
    const r = await setMyPublicProfileAction({ on: next, name: publicName });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    setValue(next);
    toast.success(next ? "Your profile is public." : "Your profile is private.");
    router.refresh();
  };
  const sameAsLogin = publicName.trim().toLowerCase() === username.trim().toLowerCase() && publicName.trim() !== "";
  return (
    <Panel data-testid="public-profile-panel">
      <PanelHeader title="Public profile" subtitle={siteOn ? "The team's public page is on: visitors without an account can open it." : "The team's public page is off: nobody outside the team can see it yet."} />
      <PanelBody className="space-y-3">
        <label className="block max-w-sm space-y-1">
          <span className="text-sm font-medium text-fg">Public name</span>
          <Input value={publicName} maxLength={PUBLIC_NAME_MAX} onChange={(e) => setPublicName(e.target.value)} placeholder="The name visitors see" autoComplete="off" data-testid="public-name" />
          {sameAsLogin ? <span className="block text-xs text-warn">This is your sign-in username. A different public name keeps your login private.</span> : null}
        </label>
        <Switch id="public-profile" checked={value} disabled={busy} onChange={(v) => void save(v)} label="Show me on the team's public page" description="Your public name, profile picture, player card, roles and champion pools. Only you can change this." />
        {value && publicName.trim() !== (name ?? "") ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(true)} data-testid="public-name-save">
            Save public name
          </Button>
        ) : null}
        <p className="text-xs leading-relaxed text-fg-muted">
          Never public, whatever you choose: your sign-in username, Riot accounts, rank and statistics, match history, Solo Queue Blocks and account details. While this is off, the public page shows your role without a name or picture.
        </p>
      </PanelBody>
    </Panel>
  );
}
