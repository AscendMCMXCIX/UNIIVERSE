"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { forgetAccountAction, switchAccountAction } from "@/server/actions/account-switch";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClass } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { toast } from "@/components/ui/toast";
import { announceAccountChange, markAccountChange } from "@/components/account-guard";
import { otherUsername } from "@/components/account-menu";

interface Account {
  userId: string;
  name: string;
  username?: string | null;
  avatarUrl: string | null;
  roleLabel: string;
}

/**
 * The accounts this browser is signed in to: the one in use and the others you can switch to from
 * the account menu. Removing one signs it out of this browser (its session ends on the server).
 * Each account keeps its own sign-in, its own 24 hours and its own permissions.
 */
export function BrowserAccountsPanel({ current, others, max }: { current: Account; others: Account[]; max: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const remove = async (a: Account) => {
    setBusy(a.userId);
    const r = await forgetAccountAction(a.userId);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${a.name} is signed out of this browser`);
    router.refresh();
  };
  const switchTo = async (a: Account) => {
    setBusy(a.userId);
    markAccountChange(true);
    const r = await switchAccountAction(a.userId);
    if (!r.ok) {
      markAccountChange(false);
      setBusy(null);
      return void toast.error(r.error);
    }
    announceAccountChange();
    // A full page load on purpose (see AccountMenu).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };
  return (
    <Panel data-testid="browser-accounts">
      <PanelHeader title="Accounts on this browser" subtitle={`Switch between up to ${max + 1} accounts from your account menu. Each signs in with its own password and keeps its own permissions.`} />
      <PanelBody className="space-y-2">
        <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
          <Avatar name={current.name} src={current.avatarUrl} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{current.name}</span>
            <span className="block truncate text-xs text-fg-subtle">{[otherUsername(current) ? `Username: ${otherUsername(current)}` : null, current.roleLabel, "in use"].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
        {others.map((a) => (
          <div key={a.userId} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2" data-testid="browser-account" data-user={a.name}>
            <Avatar name={a.name} src={a.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">{a.name}</span>
              <span className="block truncate text-xs text-fg-subtle">{[otherUsername(a) ? `Username: ${otherUsername(a)}` : null, a.roleLabel].filter(Boolean).join(" · ")}</span>
            </span>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void switchTo(a)}>
              Switch
            </Button>
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void remove(a)} aria-label={`Sign ${a.name} out of this browser`} data-testid="browser-account-remove">
              <X className="h-4 w-4" aria-hidden /> Remove
            </Button>
          </div>
        ))}
        {others.length < max ? (
          <Link href="/login?add=1" className={buttonClass("outline", "sm", "mt-1")} data-testid="browser-account-add">
            <UserPlus className="h-4 w-4" aria-hidden /> Add another account
          </Link>
        ) : (
          <p className="text-xs text-fg-subtle">This browser remembers the most accounts it can. Remove one to add another.</p>
        )}
      </PanelBody>
    </Panel>
  );
}
