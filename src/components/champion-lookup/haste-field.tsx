"use client";

import * as React from "react";
import { HASTE_MAX, hasteReduction, readHasteField } from "@/domain/champion-lookup/haste";
import { formatSeconds } from "@/lib/format";
import { cn } from "@/lib/cn";

/*
  Champion Intel's ability haste for one champion (docs/CHAMPION_INTEL.md, "Haste"; the owner's
  request of 24 Nov 2026): one compact field, 0 by default, that changes the cooldowns as it is
  typed in. Digits only (readHasteField): letters and spaces are dropped, a fraction is cut to its
  whole part, a minus takes 0, more than HASTE_MAX is held to it, an empty field is 0; whenever the
  value taken is not what was typed, a short line beside the field says what was taken. On leaving
  the field it shows the value taken. 44px on touch screens and phones, 16px text there (no zoom on
  iOS), a numeric keypad (inputmode), and a label read out with the champion's name.
*/

const NOTE_WORDS = {
  held: `Held to ${HASTE_MAX}`,
  whole: "Whole numbers only",
  negative: "Taken as 0",
} as const;

export function HasteField({ haste, onChange, champion, testId = "lookup-haste" }: { haste: number; onChange: (haste: number) => void; champion: string; testId?: string }) {
  const id = React.useId();
  const [text, setText] = React.useState(String(haste));
  const [note, setNote] = React.useState<keyof typeof NOTE_WORDS | null>(null);
  const [focused, setFocused] = React.useState(false);
  // A haste set from elsewhere (the address, Back) shows as it is when the field is not being edited.
  const [seen, setSeen] = React.useState(haste);
  if (seen !== haste) {
    setSeen(haste);
    if (!focused && readHasteField(text).value !== haste) {
      setText(String(haste));
      setNote(null);
    }
  }
  const cut = haste > 0 ? `${formatSeconds(hasteReduction(haste))}% shorter` : "Base";
  return (
    <div className="flex min-w-0 flex-col items-end gap-0.5" data-testid={testId} data-haste={haste}>
      <div className="flex items-center gap-2">
        <label htmlFor={`${id}-field`} className="label-caps whitespace-nowrap">
          Haste<span className="sr-only">: ability haste for {champion}, a whole number from 0 to {HASTE_MAX}</span>
        </label>
        <input
          id={`${id}-field`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          spellCheck={false}
          value={text}
          aria-describedby={`${id}-cut${note ? ` ${id}-note` : ""}`}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            const read = readHasteField(e.target.value);
            setText(read.text);
            setNote(read.note);
            onChange(read.value);
          }}
          onBlur={() => {
            setFocused(false);
            // Shown as it is taken: "12.5" reads 12, "999" reads 300, an empty field 0.
            setText(String(readHasteField(text).value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={cn(
            "h-11 w-16 rounded-md border bg-bg-elevated px-2 text-right text-base font-semibold tabular-nums text-fg hover:border-fg-subtle focus:border-accent focus:outline-none md:pointer-fine:h-8 md:pointer-fine:w-14 md:pointer-fine:text-sm",
            haste > 0 ? "border-accent/60" : "border-border-control",
          )}
          data-testid={`${testId}-input`}
        />
      </div>
      <p className="text-right text-2xs leading-tight text-fg-subtle" aria-live="polite">
        <span id={`${id}-cut`} data-testid={`${testId}-cut`}>
          {cut}
        </span>
        {note ? (
          <span id={`${id}-note`} className="text-warn" data-testid={`${testId}-note`}>
            {" · "}
            {NOTE_WORDS[note]}
          </span>
        ) : null}
      </p>
    </div>
  );
}
