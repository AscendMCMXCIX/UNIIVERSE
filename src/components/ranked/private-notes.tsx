"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { Textarea } from "@/components/ui/input";
import { TYPING_MS, useFocusAutosave } from "./use-focus-autosave";

/** The longest note kept (the server enforces the same limit). */
const MAX = 4000;

/**
 * Patterns & Notes, the notes half: the player's own free text beside their patterns (what they
 * noticed, what to try next). Private like the rest of Solo Queue Blocks; it saves as you type
 * (after a pause, on leaving the field and on leaving the page), with "Saved" only once stored.
 */
export function PrivateNotes({ initial }: { initial: string }) {
  const [notes, setNotes] = React.useState(initial);
  const { state, queue, flush } = useFocusAutosave();
  const id = React.useId();
  return (
    <section aria-labelledby={`${id}-title`} className="rounded-card border border-border bg-surface p-4" data-testid="private-notes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold text-fg">
          Notes
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.6875rem] font-medium text-fg-muted">
            <Lock className="h-3 w-3" aria-hidden /> Only you
          </span>
        </h2>
        <span data-testid="notes-save-status" data-state={state.phase}>
          <SaveStatusIndicator status={state.phase} error={state.phase === "error" ? state.message : null} onRetry={() => void flush()} />
        </span>
      </div>
      <label htmlFor={`${id}-notes`} className="sr-only">
        Your private notes
      </label>
      <Textarea
        id={`${id}-notes`}
        value={notes}
        maxLength={MAX}
        rows={5}
        onChange={(e) => {
          const value = e.target.value;
          setNotes(value);
          queue({ notes: value }, TYPING_MS);
        }}
        onBlur={() => void flush()}
        placeholder="What you notice about your games, and what to try next. Only you can read this."
        className="mt-2 block resize-y"
        data-testid="notes-input"
      />
      <p className="mt-1 text-right text-[0.6875rem] tabular-nums text-fg-subtle">
        {notes.length.toLocaleString("en")} / {MAX.toLocaleString("en")}
      </p>
    </section>
  );
}
