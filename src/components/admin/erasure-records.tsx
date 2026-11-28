"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw, Upload } from "lucide-react";
import { exportErasuresAction, importErasuresAction, reconcileErasuresAction, releaseErasureAction } from "@/server/actions/privacy";
import type { ErasureRecordView } from "@/server/privacy/ledger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatCount, formatDate } from "@/lib/format";
import { REAPPLY_PHRASE, typedMatches } from "@/domain/typed-confirmation";
import { PagedFooter, usePagedRows } from "@/components/ui/paged-list";
import { WorkspaceCard } from "@/components/ui/workspace";

/*
  The erasure records (Admin Mode → Users & Permissions → Personal data): one line per erasure,
  naming no one. From here an administrator exports them to keep beside offline backups and
  releases a person's Riot accounts when that person asks to come back. Importing them into a
  restored database and re-applying them are the Owner's, each only once REAPPLY is typed: they do
  what the erasure-reconcile setup job does (server/actions/privacy.ts checks both again).

  On a desktop window (Personal data's workspace) the records are paged to the room left under the
  actions (usePagedRows, the inline Pager in the card's foot), the card reaching the frame's foot;
  elsewhere every record is listed, as always.
*/

type Asking = { kind: "import"; file: File } | { kind: "reconcile" };

/** Import or Re-apply: what it does, and its button only once REAPPLY is typed. */
function ReapplyDialog({ asking, busy, onCancel, onRun }: { asking: Asking | null; busy: boolean; onCancel: () => void; onRun: (typed: string) => void }) {
  // The parent keys it by each opening, so nothing typed carries over.
  const [typed, setTyped] = React.useState("");
  const id = React.useId();
  const importing = asking?.kind === "import";
  return (
    <Dialog size="form"
      open={!!asking}
      onClose={() => (busy ? undefined : onCancel())}
      title={importing ? "Import and re-apply the erasure records?" : "Re-apply every erasure?"}
      description={
        importing
          ? "Adds the records in the chosen file, then applies every erasure record to the whole database again, as after restoring a backup. Whatever it finds is erased for good."
          : "Applies every personal-data erasure record to the whole database again, as after restoring a backup. Whatever it finds is erased for good."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onRun(typed)} disabled={!typedMatches(typed, REAPPLY_PHRASE) || busy} data-testid="reapply-confirm-run">
            {busy ? "Re-applying…" : importing ? "Import and re-apply" : "Re-apply"}
          </Button>
        </>
      }
    >
      <div className="space-y-1" data-testid="reapply-confirm">
        <Label htmlFor={`${id}-phrase`}>
          Type <span className="font-semibold text-fg">{REAPPLY_PHRASE}</span> to confirm
        </Label>
        <Input id={`${id}-phrase`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="reapply-confirm-input" />
      </div>
    </Dialog>
  );
}

function ReleaseButton({ reference }: { reference: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} data-testid="erasure-release">
        Release
      </Button>
      <Dialog size="form"
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={`Release ${reference}?`}
        description="Only when the person asked to come back and you checked it is them."
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy || typed.trim().toUpperCase() !== reference}
              onClick={async () => {
                setBusy(true);
                const r = await releaseErasureAction(reference, typed);
                setBusy(false);
                if (!r.ok) return toast.error("Not released", { description: r.error });
                setOpen(false);
                toast.success(`${reference} released: their Riot accounts can be linked again.`);
                router.refresh();
              }}
            >
              Release
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-fg-muted">
          <p>Their Riot accounts can then be linked to a new account, and games synced from now on include them. What was erased stays erased, and a restored backup still loses the account and profile this erasure removed.</p>
          <div>
            <Label htmlFor={id}>
              Type <span className="font-semibold text-fg">{reference}</span> to confirm
            </Label>
            <Input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function ErasureRecords({ records, viewerIsOwner = false }: { records: ErasureRecordView[]; viewerIsOwner?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"export" | "import" | "reconcile" | null>(null);
  const [asking, setAsking] = React.useState<Asking | null>(null);
  const [opened, setOpened] = React.useState(0);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // The measure's refs are this component's own (the React compiler's lint refuses refs read from the hook's result).
  const listRef = React.useRef<HTMLUListElement>(null);
  const footRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLElement>(null);
  const { shown, regionProps, listProps, rowProps, pagerProps, footTestId, onListKeyDown } = usePagedRows({ rows: records, keyOf: (r) => r.reference, words: { one: "record", many: "records" }, testId: "erasure-records", probeRem: 2.75, lastLess: 1, listRef, footRef, cardRef });
  const ask = (next: Asking) => {
    setOpened((n) => n + 1);
    setAsking(next);
  };

  const exportRecords = async () => {
    setBusy("export");
    const r = await exportErasuresAction();
    setBusy(null);
    if (!r.ok) return toast.error("Could not export", { description: r.error });
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `erasure-records-${r.data.exportedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast.success(`${formatCount(r.data.records.length)} record(s) exported. Keep the file with your offline backups.`);
  };
  const importRecords = async (file: File, typed: string) => {
    setBusy("import");
    const r = await importErasuresAction(await file.text(), typed);
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return toast.error("Could not import", { description: r.error });
    setAsking(null);
    toast.success(`Imported ${formatCount(r.data.added)} new and ${formatCount(r.data.updated)} updated record(s); ${formatCount(r.data.reconcile.people)} account(s) or profile(s) and ${formatCount(r.data.reconcile.traces)} set(s) of traces erased again.`);
    router.refresh();
  };
  const reconcile = async (typed: string) => {
    setBusy("reconcile");
    const r = await reconcileErasuresAction(typed);
    setBusy(null);
    if (!r.ok) return toast.error("Could not re-apply the records", { description: r.error });
    setAsking(null);
    const found = r.data.people + r.data.traces;
    toast.success(found ? `Re-applied: ${formatCount(r.data.people)} account(s) or profile(s) and ${formatCount(r.data.traces)} set(s) of traces erased again.` : "Re-applied: nothing erased had come back.");
    if (r.data.unusable) toast.error(`${formatCount(r.data.unusable)} record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be applied.`);
    router.refresh();
  };

  return (
    // In the workspace a flex column: the actions first, the records' card last, filling the room to the frame's foot.
    <div className="space-y-3 ws:flex ws:flex-1 ws:flex-col ws:gap-3 ws:space-y-0" data-testid="erasure-records">
      {records.length ? (
        <WorkspaceCard bare ref={cardRef} className="rounded-card border border-border ws:order-last" {...regionProps}>
          <ul ref={listRef} className="divide-y divide-border" {...listProps} onKeyDown={onListKeyDown}>
          {shown.map((r) => (
            <li key={r.reference} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm" data-testid="erasure-record" {...rowProps(r)}>
              <span className="font-semibold tabular-nums text-fg">{r.reference}</span>
              <span className="text-fg-muted">erased {formatDate(r.erasedAt)}</span>
              {!r.usable ? (
                <>
                  <Badge tone="bad">Cannot be applied</Badge>
                  <span className="text-xs text-fg-muted">Made with an older security key, so it can no longer be applied.</span>
                </>
              ) : r.releasedAt ? (
                <>
                  <Badge tone="neutral">Released {formatDate(r.releasedAt)}</Badge>
                  <span className="text-xs text-fg-muted">Their Riot accounts may be linked again.</span>
                </>
              ) : (
                <Badge tone="good">In force</Badge>
              )}
              <span className="flex-1" />
              {r.usable && !r.releasedAt ? <ReleaseButton reference={r.reference} /> : null}
            </li>
          ))}
          </ul>
          <PagedFooter footRef={footRef} pager={pagerProps} testId={footTestId} />
        </WorkspaceCard>
      ) : (
        <p className="text-sm text-fg-muted">No one has been erased.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" wrap disabled={busy !== null} onClick={() => void exportRecords()} data-testid="erasure-export">
          <Download className="h-4 w-4" /> {busy === "export" ? "Exporting…" : "Export records"}
        </Button>
        {viewerIsOwner ? (
          <>
            <Button size="sm" variant="outline" wrap disabled={busy !== null} onClick={() => fileRef.current?.click()} data-testid="erasure-import">
              <Upload className="h-4 w-4" /> {busy === "import" ? "Importing…" : "Import records"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) ask({ kind: "import", file });
              }}
            />
            <Button size="sm" variant="outline" wrap disabled={busy !== null} onClick={() => ask({ kind: "reconcile" })} data-testid="erasure-reconcile">
              <RefreshCw className="h-4 w-4" /> {busy === "reconcile" ? "Re-applying…" : "Re-apply records"}
            </Button>
          </>
        ) : null}
      </div>
      {viewerIsOwner ? null : (
        <p className="text-sm text-fg-muted" data-testid="erasure-owner-only">
          The Owner imports and re-applies the records, after a backup is restored.
        </p>
      )}
      <ReapplyDialog
        key={opened}
        asking={asking}
        busy={busy === "import" || busy === "reconcile"}
        onCancel={() => {
          setAsking(null);
          if (fileRef.current) fileRef.current.value = "";
        }}
        onRun={(typed) => {
          if (asking?.kind === "import") void importRecords(asking.file, typed);
          else if (asking) void reconcile(typed);
        }}
      />
    </div>
  );
}
