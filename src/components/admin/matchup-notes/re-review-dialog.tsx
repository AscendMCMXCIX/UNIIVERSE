"use client";

import * as React from "react";
import { patchesSince, scopeChampions } from "@/domain/matchup/notes";
import { publicPatchName } from "@/domain/patch";
import { confirmMatchupNoteAction, retireMatchupNoteAction, unpublishMatchupNoteAction } from "@/server/actions/matchup-notes";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { AdminNoteRow } from "./matchup-notes-admin";

/*
  Matchup Intel's re-review (Admin → Matchup notes, "Needs re-review"): what changed in Riot's data
  for each champion since the note's review (its abilities' hashes then and now), and Riot's patch
  notes for every patch since, for a person to read: nothing reads them automatically. Then Confirm
  (the text still holds: a new review on the current patch), Edit, Unpublish or Retire.
*/

/** Riot's patch notes page for a public patch ("26.24"). */
export function patchNotesUrl(publicPatch: string): string {
  return `https://www.leagueoflegends.com/en-us/news/game-updates/patch-${publicPatch.replace(".", "-")}-notes/`;
}

export function ReReviewDialog({ row, names, knownDesc, currentPatch, onClose, onEdit, onDone }: { row: AdminNoteRow; names: ReadonlyMap<string, string>; knownDesc: string[]; currentPatch: string | null; onClose: () => void; onEdit: () => void; onDone: (message: string) => void }) {
  const [busy, setBusy] = React.useState(false);
  const { note } = row;
  const since = note.reviewedPatch ? patchesSince(note.reviewedPatch, knownDesc) : [];
  const act = async (work: () => ReturnType<typeof confirmMatchupNoteAction>, message: string) => {
    setBusy(true);
    const r = await work();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    onDone(message);
  };
  return (
    <Dialog
      open
      size="form"
      onClose={onClose}
      title="Re-review a matchup note"
      description={`Reviewed on ${note.reviewedPatch ? publicPatchName(note.reviewedPatch) : "an earlier patch"}${currentPatch ? `; the game is on ${currentPatch}` : ""}.`}
      footer={
        <>
          <Button variant="ghost" onClick={() => void act(() => retireMatchupNoteAction(note.id), "Note retired")} disabled={busy} data-testid="matchup-review-retire">
            Retire
          </Button>
          <Button variant="ghost" onClick={() => void act(() => unpublishMatchupNoteAction(note.id), "Note unpublished")} disabled={busy} data-testid="matchup-review-unpublish">
            Unpublish
          </Button>
          <Button onClick={onEdit} disabled={busy} data-testid="matchup-review-edit">
            Edit
          </Button>
          <Button variant="primary" onClick={() => void act(() => confirmMatchupNoteAction(note.id), "Note confirmed")} disabled={busy} data-testid="matchup-review-confirm">
            Confirm{currentPatch ? ` for ${currentPatch}` : ""}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm" data-testid="matchup-review">
        <section className="space-y-1">
          <h3 className="font-semibold text-fg">What changed in Riot&apos;s data</h3>
          <ul className="space-y-0.5 text-fg-muted">
            {scopeChampions(note).map((id) => (
              <li key={id} data-testid="matchup-review-changed" data-champion={id}>
                {names.get(id) ?? id}: {row.changedParts[id]?.length ? row.changedParts[id]!.join(", ") : row.freshness.state === "hidden-changed" && row.freshness.changed.includes(id) ? "changed" : "no change recorded"}
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-subtle">Riot&apos;s data cannot show every balance change: read the patch notes too.</p>
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold text-fg">Riot&apos;s patch notes since the review</h3>
          {since.length ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {since.map((p) => (
                <li key={p}>
                  <a href={patchNotesUrl(p)} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline" data-testid="matchup-review-patch-notes">
                    Patch {p} notes
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">No patch since the review.</p>
          )}
        </section>
        <section className="space-y-1">
          <h3 className="font-semibold text-fg">The note</h3>
          <ul className="list-disc space-y-1 pl-5 text-fg">
            {note.points.map((p, i) => (
              <li key={i}>{p.text}</li>
            ))}
          </ul>
        </section>
      </div>
    </Dialog>
  );
}
