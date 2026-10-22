"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ShieldAlert } from "lucide-react";
import { eraseAction, eraseFormerAction, previewErasureAction, previewFormerErasureAction, type ErasureCheck, type ErasureDone } from "@/server/actions/privacy";
import type { ErasureCounts } from "@/server/privacy/erasure";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { BACKUP_RETENTION_DAYS } from "@/domain/privacy";
import { copyText } from "@/lib/copy-text";
import { formatCount } from "@/lib/format";

/*
  Permanent erasure, from Admin Mode → Users & Permissions. The dialog first asks the server what
  would change (nothing is touched), shows it in plain words, and erases only after the
  administrator types the person's username (or Riot ID) and ticks that it cannot be undone.
  Erasure is not Delete: Deactivate blocks sign-in and keeps everything; Delete removes the account
  and can keep an archived profile; Erase removes the person and de-identifies what others keep.
*/

const n = (value: number, one: string, many: string) => `${formatCount(value)} ${value === 1 ? one : many}`;

/** The preview's counts as the sentences an administrator reads (only what applies). */
export function erasureLines(c: ErasureCounts): string[] {
  const lines: string[] = [];
  if (c.account) lines.push("Their account and every signed-in session are removed.");
  if (c.profile) lines.push(`Their player profile is removed: roles, champion pools, card customisation, banner, social links${c.journalEntries ? ` and ${n(c.journalEntries, "Solo Queue Blocks entry", "Solo Queue Blocks entries")}` : " and their Solo Queue Blocks journal"}.`);
  if (c.riotAccounts) lines.push(`${n(c.riotAccounts, "linked Riot account is", "linked Riot accounts are")} removed with ${n(c.games, "stored game", "stored games")}, mastery and rank history.`);
  if (c.gamesDeleted) lines.push(`${n(c.gamesDeleted, "game only they played is", "games only they played are")} deleted.`);
  if (c.gamesDeidentified) lines.push(`${n(c.gamesDeidentified, "game shared with others is", "games shared with others are")} kept for the others, with them shown as "Removed player" (no name, champion or figures).`);
  if (c.lanePartners) lines.push(`${n(c.lanePartners, "teammate's game no longer records", "teammates' games no longer record")} them as the lane opponent.`);
  if (c.teamRecords) lines.push(`${n(c.teamRecords, "team draft or match record keeps", "team draft and match records keep")} the team's history with them as "Former member".`);
  if (c.notes) lines.push(`${n(c.notes, "note written by someone else names", "notes written by others name")} them: their names become "[removed]", the rest of each note stays.`);
  if (c.scoutPlayers) lines.push(`${n(c.scoutPlayers, "Clash Scout player is", "Clash Scout players are")} cleared.`);
  if (c.auditEntries) lines.push(`${n(c.auditEntries, "admin log entry names", "admin log entries name")} them "Erased member" from now on.`);
  if (c.jobLogs) lines.push(`${n(c.jobLogs, "job log loses", "job logs lose")} their Riot ID.`);
  if (c.otherRecords) lines.push(`${n(c.otherRecords, "other record about them is", "other records about them are")} removed (ranks, scouting).`);
  lines.push("A record of keyed codes (no names) keeps them out of games synced later and stops their Riot accounts being linked again by accident.");
  return lines;
}

function Summary({ check }: { check: ErasureCheck }) {
  return (
    <div className="space-y-3 text-sm" data-testid="erasure-preview">
      {check.subject.riotIds.length ? (
        <p className="text-fg-muted">
          Riot IDs: <span className="break-all text-fg">{check.subject.riotIds.join(", ")}</span>
        </p>
      ) : null}
      <ul className="list-disc space-y-1.5 pl-5 text-fg-muted marker:text-fg-subtle">
        {erasureLines(check.counts).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {check.mentions.length ? <p className="text-xs text-fg-subtle">Notes changed: {check.mentions.map((m) => `${m.where} (${formatCount(m.rows)})`).join(" · ")}.</p> : null}
      <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
        Encrypted backups made before now keep this information until they expire (up to {BACKUP_RETENTION_DAYS} days), and an offline copy until whoever holds it deletes it. If a backup is ever restored, re-apply the erasure records first (Admin Mode → Users & Permissions → Personal data). Copies held by Riot or other services are not affected.
      </p>
    </div>
  );
}

function Done({ done, onClose }: { done: ErasureDone; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="space-y-3 text-sm" data-testid="erasure-done">
      <p className="text-fg">
        Erased. Reference <span className="font-semibold tabular-nums">{done.reference}</span>: keep it with the request; it names no one.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (await copyText(done.reference)) setCopied(true);
            else toast.error("Could not copy", { description: "Select the reference and copy it by hand." });
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-good" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copied" : "Copy reference"}
        </Button>
        <Button size="sm" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

/** The confirmation step shared by both kinds of erasure. */
function ConfirmStep({ check, typed, setTyped, understood, setUnderstood }: { check: ErasureCheck; typed: string; setTyped: (v: string) => void; understood: boolean; setUnderstood: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-3">
      <div>
        <Label htmlFor={`${id}-confirm`}>
          Type <span className="font-semibold text-fg">{check.confirmWith}</span> to confirm
        </Label>
        <Input id={`${id}-confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} data-testid="erasure-confirm-input" />
      </div>
      <label className="flex items-start gap-2 text-sm text-fg-muted">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-bad" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} data-testid="erasure-understood" />
        I understand this is permanent and cannot be undone.
      </label>
    </div>
  );
}

/**
 * Where a finished erasure shows its reference. The person's row disappears as soon as the page
 * refreshes after the erasure (and the dialog it opened with it), so a list of people provides
 * this from above: the result stays on screen until the administrator closes it.
 */
const ResultContext = React.createContext<((done: ErasureDone) => void) | null>(null);

export function ErasureResultHost({ children }: { children: React.ReactNode }) {
  const [done, setDone] = React.useState<ErasureDone | null>(null);
  return (
    <ResultContext.Provider value={setDone}>
      {children}
      <Dialog open={!!done} onClose={() => setDone(null)} title="Personal data erased">
        {done ? <Done done={done} onClose={() => setDone(null)} /> : null}
      </Dialog>
    </ResultContext.Provider>
  );
}

const matches = (typed: string, expected: string) => typed.trim().normalize("NFKC").toLowerCase() === expected.trim().normalize("NFKC").toLowerCase() && expected !== "";

/** "Erase personal data" for an account (with its profile) or a profile without an account. */
export function ErasePersonButton({ target, name }: { target: { userId?: string | null; playerId?: string | null }; name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [check, setCheck] = React.useState<ErasureCheck | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [typed, setTyped] = React.useState("");
  const [understood, setUnderstood] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<ErasureDone | null>(null);
  const report = React.useContext(ResultContext);

  const start = async () => {
    setOpen(true);
    setCheck(null);
    setError(null);
    setTyped("");
    setUnderstood(false);
    setDone(null);
    const r = await previewErasureAction(target);
    if (r.ok) setCheck(r.data);
    else setError(r.error);
  };
  const close = () => {
    if (busy) return;
    setOpen(false);
    if (done) router.refresh();
  };
  const erase = async () => {
    if (!check) return;
    setBusy(true);
    const r = await eraseAction(target, typed);
    setBusy(false);
    if (!r.ok) {
      toast.error("Nothing was erased", { description: r.error });
      return;
    }
    toast.success(`${name}'s personal data was erased (${r.data.reference}).`);
    if (!report) return setDone(r.data);
    setOpen(false);
    report(r.data);
  };
  const ready = !!check && understood && matches(typed, check.confirmWith);

  return (
    <>
      <Button size="sm" variant="ghost" className="text-bad" onClick={() => void start()} data-testid="erase-person">
        Erase personal data
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={done ? "Personal data erased" : `Erase ${name}'s personal data?`}
        description={done ? undefined : "Permanent: unlike Delete, nothing of theirs is kept, and it cannot be undone."}
        footer={
          done ? undefined : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void erase()} disabled={!ready || busy} data-testid="erasure-confirm">
                {busy ? "Erasing…" : "Erase permanently"}
              </Button>
            </>
          )
        }
      >
        {done ? (
          <Done done={done} onClose={close} />
        ) : error ? (
          <p className="flex items-start gap-2 text-sm text-bad" role="alert">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        ) : check ? (
          <>
            <Summary check={check} />
            <ConfirmStep check={check} typed={typed} setTyped={setTyped} understood={understood} setUnderstood={setUnderstood} />
          </>
        ) : (
          <p className="text-sm text-fg-muted" role="status">
            Checking what would change…
          </p>
        )}
      </Dialog>
    </>
  );
}

/** Erasing what a former member left (their account or profile is already gone), found by their Riot ID. */
export function EraseFormerMember() {
  const router = useRouter();
  const [riotId, setRiotId] = React.useState("");
  const [names, setNames] = React.useState("");
  const [check, setCheck] = React.useState<ErasureCheck | null>(null);
  const [typed, setTyped] = React.useState("");
  const [understood, setUnderstood] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<ErasureDone | null>(null);
  const id = React.useId();

  const preview = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setCheck(null);
    setDone(null);
    const r = await previewFormerErasureAction({ riotId, names });
    setBusy(false);
    if (r.ok) {
      setCheck(r.data);
      setTyped("");
      setUnderstood(false);
    } else toast.error("Could not check that Riot ID", { description: r.error });
  };
  const erase = async () => {
    setBusy(true);
    const r = await eraseFormerAction({ riotId, names, confirmation: typed });
    setBusy(false);
    if (!r.ok) {
      toast.error("Nothing was erased", { description: r.error });
      return;
    }
    setDone(r.data);
    setCheck(null);
    router.refresh();
  };
  const ready = !!check && understood && matches(typed, check.confirmWith);

  return (
    <div className="space-y-3" data-testid="erase-former">
      <form onSubmit={(e) => void preview(e)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <Label htmlFor={`${id}-riot`}>Their Riot ID</Label>
          <Input id={`${id}-riot`} value={riotId} onChange={(e) => setRiotId(e.target.value)} placeholder="GameName#TAG" autoComplete="off" spellCheck={false} required />
        </div>
        <div>
          <Label htmlFor={`${id}-names`}>Names they used here (optional, comma-separated)</Label>
          <Input id={`${id}-names`} value={names} onChange={(e) => setNames(e.target.value)} placeholder="Old username, display name" autoComplete="off" spellCheck={false} />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !riotId.trim()}>
          {busy && !check ? "Checking…" : "Check"}
        </Button>
      </form>
      {check ? (
        <div className="rounded-card border border-bad/30 bg-bad/5 p-3">
          <Summary check={check} />
          <ConfirmStep check={check} typed={typed} setTyped={setTyped} understood={understood} setUnderstood={setUnderstood} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setCheck(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void erase()} disabled={!ready || busy} data-testid="erasure-confirm">
              {busy ? "Erasing…" : "Erase permanently"}
            </Button>
          </div>
        </div>
      ) : null}
      {done ? <Done done={done} onClose={() => setDone(null)} /> : null}
    </div>
  );
}
