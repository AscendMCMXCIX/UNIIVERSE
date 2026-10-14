"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { endSeriesAction, reopenSeriesAction } from "@/server/actions/series";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/** Next game / end / cancel / reopen for a series. Archive housekeeping only. */
export function SeriesControls({ seriesId, status, canStartNext, canEdit }: { seriesId: string; status: "in_progress" | "completed" | "cancelled"; canStartNext: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState<"end" | "cancel" | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    setConfirming(null);
    if (!r.ok) toast.error("That did not work", { description: r.error ?? "Failed" });
    else {
      toast.success(done);
      router.refresh();
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canStartNext && canEdit ? (
        <Link href={`/draft?series=${seriesId}`} className={buttonClass("primary", "sm")}>
          Next game <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
      {status === "in_progress" && canEdit ? (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirming("end")}>
            End series
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirming("cancel")}>
            Cancel series
          </Button>
        </>
      ) : null}
      {status !== "in_progress" && canEdit ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => reopenSeriesAction(seriesId), "Series reopened.")}>
          Reopen series
        </Button>
      ) : null}
      <ConfirmDialog open={confirming === "end"} busy={busy} tone="primary" title="End the series now?" description="It is decided by the current score (or cancelled when tied)." confirmLabel="End series" onCancel={() => setConfirming(null)} onConfirm={() => run(() => endSeriesAction(seriesId), "Series ended.")} />
      <ConfirmDialog open={confirming === "cancel"} busy={busy} title="Cancel the series?" description="Games already played keep their records." confirmLabel="Cancel series" onCancel={() => setConfirming(null)} onConfirm={() => run(() => endSeriesAction(seriesId, { cancel: true }), "Series cancelled.")} />
    </div>
  );
}
