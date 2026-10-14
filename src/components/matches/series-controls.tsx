"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { endSeriesAction, reopenSeriesAction } from "@/server/actions/series";
import { Button, buttonClass } from "@/components/ui/button";

/** Next game / end / cancel / reopen for a series. Archive housekeeping only. */
export function SeriesControls({ seriesId, status, canStartNext, canEdit }: { seriesId: string; status: "in_progress" | "completed" | "cancelled"; canStartNext: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Failed");
    else router.refresh();
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
          <Button size="sm" variant="outline" disabled={busy} onClick={() => confirm("End the series now? It is decided by the current score (or cancelled when tied).") && run(() => endSeriesAction(seriesId))}>
            End series
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirm("Cancel the series? Games already played keep their records.") && run(() => endSeriesAction(seriesId, { cancel: true }))}>
            Cancel series
          </Button>
        </>
      ) : null}
      {status !== "in_progress" && canEdit ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => reopenSeriesAction(seriesId))}>
          Reopen series
        </Button>
      ) : null}
      {error ? <span className="text-xs text-bad">{error}</span> : null}
    </div>
  );
}
