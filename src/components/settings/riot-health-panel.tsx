"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, RefreshCw } from "lucide-react";
import type { CredentialState } from "@/server/riot/credential";
import { checkRiotKeyAction, retryPendingAccountsAction } from "@/server/actions/accounts";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Info } from "@/components/ui/metric";
import { RelativeTime } from "@/components/ui/relative-time";

export interface RiotHealthView {
  configured: boolean;
  state: CredentialState;
  keyFingerprint: string | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastStatusCode: number | null;
  advice: string | null;
  pendingAccounts: number;
}

const STATE: Record<CredentialState, { label: string; tone: BadgeTone; plain: string }> = {
  accepted: { label: "Accepted", tone: "good", plain: "Riot data is available." },
  rejected: { label: "Rejected", tone: "bad", plain: "Riot data is temporarily unavailable; linked accounts sync automatically once it returns." },
  unavailable: { label: "Riot unavailable", tone: "warn", plain: "Riot did not answer the last request; it is retried automatically." },
  unknown: { label: "Not checked yet", tone: "neutral", plain: "Riot data has not been requested yet." },
  "not-configured": { label: "Not configured", tone: "neutral", plain: "Riot data is not available on this server yet." },
};

/**
 * Riot API health. Everyone sees whether Riot data is available; owners also see the credential
 * state, when Riot last answered, the last error and what to do about it. The key itself is
 * never shown; only its last characters, so the owner can tell which key a deployment carries.
 */
export function RiotHealthPanel({ riot, isOwner }: { riot: RiotHealthView; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"check" | "retry" | null>(null);
  const s = STATE[riot.state];
  return (
    <Panel className={riot.state === "rejected" ? "border-bad/50" : undefined}>
      <PanelHeader
        title="Riot API"
        subtitle={isOwner ? "Credential status for the server's Riot API key. The key is never shown." : "Whether Riot player data can be refreshed right now."}
        actions={
          <span className="inline-flex items-center gap-1">
            <Badge tone={s.tone}>{isOwner ? `Credential: ${s.label}` : riot.state === "accepted" ? "Available" : riot.state === "not-configured" ? "Not configured" : "Temporarily unavailable"}</Badge>
            <Info text="Accepted = Riot answered a request under the current key. Rejected = Riot answered 401/403 (development keys expire after 24 hours). Unavailable = rate limit, outage or network problem." />
          </span>
        }
      />
      <PanelBody className="space-y-3 text-sm">
        {!isOwner ? (
          <p className="text-fg-muted">{s.plain}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Configured" value={riot.configured ? `Yes${riot.keyFingerprint ? ` (key ends ${riot.keyFingerprint})` : ""}` : "No"} />
              <Fact label="Last successful Riot request" value={riot.lastOkAt ? <RelativeTime date={riot.lastOkAt} /> : "none recorded"} />
              <Fact label="Last error" value={riot.lastErrorAt ? <><RelativeTime date={riot.lastErrorAt} />{riot.lastStatusCode ? ` · HTTP ${riot.lastStatusCode}` : ""}</> : "none recorded"} />
              <Fact label="Linked accounts waiting for Riot" value={String(riot.pendingAccounts)} />
            </div>
            {riot.lastError ? <p className="text-xs text-fg-muted">{riot.lastError}</p> : null}
            {riot.advice ? <p className={riot.state === "rejected" ? "rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad" : "text-xs text-fg-subtle"}>{riot.advice}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy !== null || !riot.configured} onClick={async () => { setBusy("check"); const r = await checkRiotKeyAction(); setBusy(null); if (!r.ok) toast.error("Could not check the key", { description: r.error }); else if (r.data.state === "accepted") toast.success(r.data.message); else if (r.data.state === "rejected") toast.error(r.data.message); else toast.info(r.data.message); router.refresh(); }}>
                <KeyRound className="h-3.5 w-3.5" /> {busy === "check" ? "Checking…" : "Check key now"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy !== null || !riot.configured || riot.pendingAccounts === 0} onClick={async () => { setBusy("retry"); const r = await retryPendingAccountsAction(); setBusy(null); if (!r.ok) toast.error("Retry failed", { description: r.error }); else (r.data.synced > 0 ? toast.success : toast.info)(`Retried ${r.data.attempted} account${r.data.attempted === 1 ? "" : "s"}: ${r.data.synced} synced, ${r.data.pending} still pending, ${r.data.failed} need attention.`); router.refresh(); }}>
                <RefreshCw className="h-3.5 w-3.5" /> {busy === "retry" ? "Retrying…" : "Retry pending Riot accounts"}
              </Button>
            </div>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated px-2.5 py-1.5">
      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{label}</div>
      <div className="text-sm font-semibold text-fg">{value}</div>
    </div>
  );
}
