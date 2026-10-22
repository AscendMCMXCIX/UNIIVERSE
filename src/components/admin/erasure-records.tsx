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

/*
  The erasure records (Admin Mode → Users & Permissions → Personal data): one line per erasure,
  naming no one. From here an administrator exports them to keep beside offline backups, imports
  them into a restored database, re-applies them, and releases a person's Riot accounts when that
  person asks to come back.
*/

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
      <Dialog
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

export function ErasureRecords({ records }: { records: ErasureRecordView[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"export" | "import" | "reconcile" | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

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
  const importRecords = async (file: File | undefined) => {
    if (!file) return;
    setBusy("import");
    const r = await importErasuresAction(await file.text());
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return toast.error("Could not import", { description: r.error });
    toast.success(`Imported ${formatCount(r.data.added)} new and ${formatCount(r.data.updated)} updated record(s); ${formatCount(r.data.reconcile.people)} account(s) or profile(s) and ${formatCount(r.data.reconcile.traces)} set(s) of traces erased again.`);
    router.refresh();
  };
  const reconcile = async () => {
    setBusy("reconcile");
    const r = await reconcileErasuresAction();
    setBusy(null);
    if (!r.ok) return toast.error("Could not re-apply the records", { description: r.error });
    const found = r.data.people + r.data.traces;
    toast.success(found ? `Re-applied: ${formatCount(r.data.people)} account(s) or profile(s) and ${formatCount(r.data.traces)} set(s) of traces erased again.` : "Re-applied: nothing erased had come back.");
    if (r.data.unusable) toast.error(`${formatCount(r.data.unusable)} record(s) were made under another UNIIVERSE_AUTH_SECRET and cannot be applied.`);
    router.refresh();
  };

  return (
    <div className="space-y-3" data-testid="erasure-records">
      {records.length ? (
        <ul className="divide-y divide-border rounded-card border border-border">
          {records.map((r) => (
            <li key={r.reference} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm" data-testid="erasure-record">
              <span className="font-semibold tabular-nums text-fg">{r.reference}</span>
              <span className="text-fg-muted">erased {formatDate(r.erasedAt)}</span>
              {!r.usable ? (
                <Badge tone="bad" title="Made under another UNIIVERSE_AUTH_SECRET: it can no longer be applied">
                  Cannot be applied
                </Badge>
              ) : r.releasedAt ? (
                <Badge tone="neutral" title="Their Riot accounts may be linked again">
                  Released {formatDate(r.releasedAt)}
                </Badge>
              ) : (
                <Badge tone="good">In force</Badge>
              )}
              <span className="flex-1" />
              {r.usable && !r.releasedAt ? <ReleaseButton reference={r.reference} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No one has been erased.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void exportRecords()} data-testid="erasure-export">
          <Download className="h-4 w-4" /> {busy === "export" ? "Exporting…" : "Export records"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> {busy === "import" ? "Importing…" : "Import records"}
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void importRecords(e.target.files?.[0])} />
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void reconcile()} data-testid="erasure-reconcile">
          <RefreshCw className="h-4 w-4" /> {busy === "reconcile" ? "Re-applying…" : "Re-apply records"}
        </Button>
      </div>
    </div>
  );
}
