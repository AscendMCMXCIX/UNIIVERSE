"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { deleteMatchAction } from "@/server/actions/matches";
import { buttonClass, Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/** View for everyone; Edit and Delete only for the draft's creator or a match manager (checked again on the server). */
export function MatchActions({ matchId, label, canEdit }: { matchId: string; label: string; canEdit: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-1">
      <Link href={`/matches/${matchId}`} className={buttonClass("ghost", "sm")} aria-label={`View ${label}`}>
        <Eye className="h-4 w-4" /> <span className="hidden sm:inline">View</span>
      </Link>
      {canEdit ? (
        <>
          <Link href={`/matches/${matchId}#edit`} className={buttonClass("ghost", "sm")} aria-label={`Edit ${label}`} data-testid="match-edit-link">
            <Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Edit</span>
          </Link>
          <Button size="sm" variant="ghost" className="text-bad hover:bg-bad/10 hover:text-bad" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`} data-testid="match-delete">
            <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Delete</span>
          </Button>
          <ConfirmDialog
            open={confirming}
            title={`Delete ${label}?`}
            description="It disappears from Match History; a series is re-scored without it. The draft itself is kept."
            confirmLabel="Delete match"
            busy={busy}
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              setBusy(true);
              const r = await deleteMatchAction(matchId);
              setBusy(false);
              setConfirming(false);
              if (!r.ok) return toast.error(r.error);
              toast.success("Match deleted.");
              router.refresh();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
