"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteRankedBlockAction } from "@/server/actions/ranked";
import type { RankedBlockView } from "@/server/ranked/repository";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/**
 * Delete one of your own blocks (in progress or finished), after a confirmation that says exactly
 * what goes: the block and the journal entries written in it. Riot match data, Match History and
 * statistics stay; imported games can be imported again. `after` is where to go once it is gone.
 */
export function DeleteBlockButton({ block, after, size = "sm", variant = "ghost" }: { block: Pick<RankedBlockView, "id" | "label" | "games">; after?: string; size?: "sm" | "md"; variant?: "ghost" | "outline" }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const entries = `${block.games} journal entr${block.games === 1 ? "y" : "ies"}`;
  return (
    <>
      <Button size={size} variant={variant} className="text-fg-muted hover:text-bad" onClick={() => setOpen(true)} data-testid="delete-block">
        <Trash2 className="h-4 w-4" aria-hidden /> Delete block
      </Button>
      <ConfirmDialog
        open={open}
        title={`Delete ${block.label}?`}
        description={
          <>
            This removes {block.label} and its {entries}: results, champions, mistakes, notes and teammate tags written here. Your Riot match history, Match History and statistics are not affected, and imported games can be imported again. This cannot be undone.
          </>
        }
        confirmLabel="Delete block"
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setBusy(true);
          const r = await deleteRankedBlockAction(block.id);
          setBusy(false);
          setOpen(false);
          if (!r.ok) return void toast.error("The block was not deleted", { description: r.error });
          toast.success(`${r.data.label} deleted.`, { description: `${r.data.games} journal entr${r.data.games === 1 ? "y" : "ies"} removed. Your Riot games are untouched.` });
          if (after) router.push(after);
          router.refresh();
        }}
      />
    </>
  );
}
