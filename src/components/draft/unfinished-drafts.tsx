"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Play, Trash2 } from "lucide-react";
import { abandonDraftAction, deleteDraftAction } from "@/server/actions/drafts";
import { ChampionPortrait, type PortraitChampion } from "@/components/champion-portrait";
import { Button, buttonClass } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

export interface UnfinishedDraftView {
  id: string;
  title: string;
  /** "Started 12 Oct · 8/20" */
  detail: string;
  side: "blue" | "red";
  progress: number;
  steps: number;
  ourPicks: string[];
  /** The viewer created it or is an admin: may abandon or delete it. */
  canManage: boolean;
}

/**
 * Drafts that need action: resume, abandon (keeps the record, removes it from this list and from
 * its series count) or delete permanently (with confirmation). Finished games live in Matches.
 */
export function UnfinishedDrafts({ drafts, championsById }: { drafts: UnfinishedDraftView[]; championsById: Record<string, PortraitChampion> }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ draft: UnfinishedDraftView; kind: "abandon" | "delete" } | null>(null);
  const run = async () => {
    if (!confirm) return;
    setBusy(confirm.draft.id);
    const res = confirm.kind === "delete" ? await deleteDraftAction(confirm.draft.id) : await abandonDraftAction(confirm.draft.id);
    setBusy(null);
    setConfirm(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success(confirm.kind === "delete" ? "Draft deleted." : "Draft abandoned.");
    router.refresh();
  };
  return (
    <section className="space-y-2" aria-labelledby="unfinished-title" data-testid="drafts-in-progress">
      <h2 id="unfinished-title" className="text-sm font-semibold text-fg-muted">
        Unfinished drafts
      </h2>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-3" data-testid="unfinished-draft">
            <div className="flex items-center gap-3">
              <span className={cn("h-10 w-1 shrink-0 rounded-full", d.side === "blue" ? "bg-blue" : "bg-red")} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{d.title}</div>
                <div className="text-xs text-fg-muted">{d.detail}</div>
              </div>
              <span className="flex -space-x-1">
                {d.ourPicks.slice(0, 5).map((id) => (
                  <ChampionPortrait key={id} champion={championsById[id] ?? { id, name: id, portraitUrl: "" }} size="xs" />
                ))}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((d.progress / Math.max(1, d.steps)) * 100)}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Link href={`/draft/${d.id}`} className={buttonClass("primary", "sm")}>
                <Play className="h-3.5 w-3.5" /> Resume
              </Link>
              {d.canManage ? (
                <>
                  <Button size="sm" variant="ghost" disabled={busy === d.id} onClick={() => setConfirm({ draft: d, kind: "abandon" })} data-testid="abandon-draft">
                    <Ban className="h-3.5 w-3.5" /> Abandon
                  </Button>
                  <Button size="sm" variant="ghost" className="text-bad hover:bg-bad/10" disabled={busy === d.id} onClick={() => setConfirm({ draft: d, kind: "delete" })} data-testid="delete-draft">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!confirm}
        tone={confirm?.kind === "delete" ? "danger" : "primary"}
        title={confirm?.kind === "delete" ? `Delete "${confirm.draft.title}" permanently?` : `Abandon "${confirm?.draft.title ?? ""}"?`}
        description={confirm?.kind === "delete" ? "The draft and its picks are removed for good. Finished matches and other drafts are not affected." : "It disappears from this list and no longer counts as a game in its series. Nothing is deleted."}
        confirmLabel={confirm?.kind === "delete" ? "Delete draft" : "Abandon draft"}
        busy={!!busy}
        onCancel={() => setConfirm(null)}
        onConfirm={run}
      />
    </section>
  );
}
