"use client";

import * as React from "react";
import { PanelRightOpen } from "lucide-react";
import { DetailModal } from "@/components/ui/detail-modal";
import { cn } from "@/lib/cn";

/*
  A button that opens longer reference text in the app's standard window (DetailModal "standard":
  the whole screen on a phone, a centred window wider up; Escape and Close shut it, and focus goes
  back to the button). Matchup Intel's dashboard keeps each ability tile to its essentials and puts
  the rest here: Riot's description, every fact with its source or quoted clause, the checked notes'
  longer words (docs/MATCHUP_INTEL.md, "Progressive disclosure"). The window's content is rendered
  on the server and handed in as children; nothing is fetched.
*/

export function DetailsDialog({
  label,
  name,
  title,
  description,
  children,
  testId,
  bodyTestId,
  className,
  iconOnly = false,
}: {
  /** The button's visible word ("Details"); with `iconOnly`, the start of its name for screen readers and its tooltip. */
  label: string;
  /** Only the icon shows (a dense tile): a 24px target, 44px on touch screens. */
  iconOnly?: boolean;
  /** Read after the visible word, so the button's name starts with it ("Details: Obliterate, Q"). */
  name: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  bodyTestId?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          // The window gives the focus back to what had it when it opened; Safari never focuses a
          // tapped or clicked button, so the button takes it first and the focus comes back to it.
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
        aria-haspopup="dialog"
        title={iconOnly ? label : undefined}
        className={cn("touch-target inline-flex min-h-6 shrink-0 items-center gap-1 rounded-sm text-xs font-medium text-accent hover:text-accent-strong", iconOnly && "min-w-6 justify-center", className)}
        data-testid={testId}
      >
        <PanelRightOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {iconOnly ? <span className="sr-only">{`${label}: ${name}`}</span> : label}
        {iconOnly ? null : <span className="sr-only">: {name}</span>}
      </button>
      <DetailModal open={open} onClose={() => setOpen(false)} title={title} description={description} size="standard" bodyTestId={bodyTestId}>
        {children}
      </DetailModal>
    </>
  );
}
