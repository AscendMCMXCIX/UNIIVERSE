"use client";

import * as React from "react";
import { saveSessionNoteAction } from "@/server/actions/development";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { useAction } from "./use-action";

/** The player's own closing note on a session: private, any time after it. */
export function SessionNoteEditor({ sessionId, note }: { sessionId: string; note: string }) {
  const { busy, run } = useAction();
  const [value, setValue] = React.useState(note);
  const uid = React.useId();
  const changed = value.trim() !== note.trim();
  return (
    <div className="space-y-2" data-testid="session-note">
      <Label htmlFor={`${uid}-note`}>Your closing note (private)</Label>
      <Textarea id={`${uid}-note`} rows={2} maxLength={300} value={value} onChange={(e) => setValue(e.target.value)} placeholder="What you take from this session, in a line." />
      <Button size="sm" variant="outline" disabled={busy || !changed} onClick={() => void run(() => saveSessionNoteAction(sessionId, value), { success: "Note saved." })} data-testid="session-note-save">
        {busy ? "Saving…" : "Save note"}
      </Button>
    </div>
  );
}
