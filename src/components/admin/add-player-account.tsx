"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UserPlus, XCircle } from "lucide-react";
import { createPlayerAccountAction, verifyRiotIdAction, type CreatedAccountView } from "@/server/actions/users";
import type { IdentityCheck } from "@/server/riot/verify-identity";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { TemporaryPasswordBox } from "./account-actions";
import { useBrandNames } from "@/components/brand-names";

type Verification = { state: "idle" } | { state: "checking"; riotId: string } | { state: "done"; riotId: string; result: IdentityCheck } | { state: "error"; riotId: string; message: string };

function VerificationLine({ v, onRetry }: { v: Verification; onRetry: () => void }) {
  if (v.state === "idle") return <p className="text-xs text-fg-subtle">Riot checks the Riot ID before the account can be created.</p>;
  if (v.state === "checking")
    return (
      <p className="flex items-center gap-1.5 text-xs text-fg-muted" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Riot account…
      </p>
    );
  if (v.state === "error" || v.result.status === "failed")
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-bad" role="status">
        <XCircle className="h-3.5 w-3.5" /> Verification failed{v.state === "done" && v.result.status === "failed" ? `: ${v.result.message}` : v.state === "error" ? `: ${v.message}` : ""}
        <button type="button" onClick={onRetry} className="text-accent underline-offset-2 hover:underline">
          Retry
        </button>
      </p>
    );
  const r = v.result;
  if (r.status === "verified")
    return (
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-good" role="status" data-testid="riot-verified">
        <CheckCircle2 className="h-3.5 w-3.5" /> Account verified: {r.riotId}
        {r.platformConfirmed ? ` · plays on ${r.platform.toUpperCase()}` : ""}
        {r.reuseArchivedPlayerId ? " · their archived profile will be restored" : ""}
      </p>
    );
  const label = r.status === "not-found" ? "Account not found" : r.status === "unavailable" ? "Riot service unavailable" : r.status === "duplicate" ? "Already a player here" : r.status === "erased" ? "Personal data erased" : "Invalid Riot ID";
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-bad" role="status">
      <XCircle className="h-3.5 w-3.5" /> {r.message.toLowerCase().startsWith(label.toLowerCase()) ? r.message : `${label}: ${r.message}`}
      {r.status === "unavailable" ? (
        <button type="button" onClick={onRetry} className="text-accent underline-offset-2 hover:underline">
          Retry
        </button>
      ) : null}
    </p>
  );
}

/**
 * Admin Mode → Users & Permissions → Add account: a username, a Riot ID and whether the person joins the
 * team or uses UNIIVERSE for themselves (a deliberate choice: nobody gets the team workspace by
 * default). Riot must confirm the Riot ID first (Create stays disabled until then); creating
 * returns a random temporary password to give the person, who replaces it at first sign-in. No
 * email, no invitation link, no roles or pools: the person chooses those on first sign-in.
 *
 * The result shown (and copied by Copy details) always belongs to the latest creation: starting a
 * new one clears the previous result first, and a reply from an older request that arrives late
 * is ignored, so the details of one person can never be copied for another.
 */
export function AddPlayerAccount() {
  const { teamName } = useBrandNames();
  const router = useRouter();
  const [username, setUsername] = React.useState("");
  const [riotId, setRiotId] = React.useState("");
  const [access, setAccess] = React.useState<"team" | "personal" | null>(null);
  const latest = React.useRef(0);
  const [verification, setVerification] = React.useState<Verification>({ state: "idle" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<CreatedAccountView | null>(null);

  const verify = async () => {
    const value = riotId.trim();
    if (!value) return;
    setVerification({ state: "checking", riotId: value });
    const r = await verifyRiotIdAction(value);
    setVerification(r.ok ? { state: "done", riotId: value, result: r.data } : { state: "error", riotId: value, message: r.error });
  };
  // The verification belongs to the exact Riot ID that was checked; editing it asks again.
  const current = verification.state !== "idle" && verification.riotId === riotId.trim() ? verification : ({ state: "idle" } as Verification);
  const verified = current.state === "done" && current.result.status === "verified";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verified || !access) return;
    const request = ++latest.current;
    // A new creation starts clean: the previous person's details disappear before anything else.
    setCreated(null);
    setBusy(true);
    setError(null);
    const r = await createPlayerAccountAction({ username, riotId, teamMember: access === "team" });
    if (request !== latest.current) return; // a newer creation started meanwhile: this reply is stale
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCreated(r.data);
    setUsername("");
    setRiotId("");
    setAccess(null);
    setVerification({ state: "idle" });
    router.refresh();
  };

  return (
    <Panel>
      <PanelHeader title="Add account" subtitle="A username, their Riot ID and whether they join the team. Riot confirms the account; you get a temporary password to give them privately. No email, no invitation link." />
      <PanelBody className="space-y-3">
        <form onSubmit={submit} className="space-y-3" data-testid="add-player-form">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] sm:items-start">
            <div>
              <Label htmlFor="new-username">Username</Label>
              <Input id="new-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. Ascend" required maxLength={32} autoComplete="off" spellCheck={false} />
            </div>
            <div>
              <Label htmlFor="new-riot-id">Riot ID</Label>
              <div className="flex gap-2">
                <Input id="new-riot-id" value={riotId} onChange={(e) => setRiotId(e.target.value)} onBlur={() => riotId.includes("#") && current.state === "idle" && void verify()} placeholder="GameName#TAG" required maxLength={40} autoComplete="off" spellCheck={false} />
                <Button type="button" variant="outline" disabled={!riotId.includes("#") || current.state === "checking"} onClick={verify}>
                  Verify
                </Button>
              </div>
            </div>
          </div>
          <fieldset className="space-y-1.5" data-testid="new-access">
            <legend className="text-sm font-medium text-fg">Access</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Access">
              {(
                [
                  ["team", `Member of the ${teamName} team`, "Team Overview, Players, Leaderboards and Matches, plus their own profile."],
                  ["personal", "Personal use only", "Their own profile, statistics and Solo Queue Blocks. No Team pages; you can add them to the team later."],
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className={cn("flex cursor-pointer gap-2.5 rounded-panel border p-3 text-sm transition-colors", access === value ? "border-accent bg-accent/10" : "border-border hover:border-border-strong")}>
                  <input type="radio" name="new-access" value={value} checked={access === value} onChange={() => setAccess(value)} className="mt-0.5 accent-[var(--color-accent)]" data-testid={`new-access-${value}`} />
                  <span className="min-w-0">
                    <span className="block font-medium text-fg">{label}</span>
                    <span className="block text-xs text-fg-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <VerificationLine v={current} onRetry={verify} />
          <Button type="submit" variant="primary" disabled={busy || !verified || !username.trim() || !access} className="w-full sm:w-auto" data-testid="create-account">
            <UserPlus className="h-4 w-4" /> {busy ? "Creating…" : "Create account"}
          </Button>
        </form>
        {error ? (
          <p className="text-xs text-bad" role="alert">
            {error}
          </p>
        ) : null}
        {created ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-good" data-testid="created-account">
              Account created for {created.username} ({created.riotId}), {created.teamMember ? "team member" : "personal use"}
              {created.reusedProfile ? ", restoring their archived profile" : ""}.
            </p>
            <TemporaryPasswordBox key={created.userId} username={created.username} password={created.temporaryPassword} expiresAt={created.expiresAt} />
          </div>
        ) : null}
      </PanelBody>
    </Panel>
  );
}
