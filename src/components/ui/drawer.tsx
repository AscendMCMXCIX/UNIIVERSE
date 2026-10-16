"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Panel widths from small screens up: md for a player or a short list, lg for analysis, xl for a scoreboard. */
export type DrawerSize = "md" | "lg" | "xl";
const WIDTH: Record<DrawerSize, string> = {
  md: "sm:w-[min(32rem,100vw)]",
  lg: "sm:w-[min(40rem,100vw)]",
  xl: "sm:w-[min(48rem,100vw)] xl:w-[min(64rem,100vw)] 2xl:w-[min(72rem,100vw)]",
};

/**
 * The one detail panel of the site (the Team Overview player panel is the model): a side panel
 * from the right on wider screens, a bottom sheet on phones (thumb-reachable, the page still
 * visible above). Native <dialog>: focus is trapped, Escape closes it, and focus returns to what
 * opened it. The page behind does not scroll; the panel scrolls inside. The close button is always
 * at the top right. Motion is a short slide that reduced-motion settings turn off.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  className,
  testId,
  size = "md",
  headerExtra,
  header,
  headerClassName,
  titleId = "drawer-title",
  closeTestId,
  bodyTestId,
  headerTestId,
}: {
  open: boolean;
  onClose: () => void;
  /** The panel's name; shown unless a custom header is given. */
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
  size?: DrawerSize;
  /** Controls beside the close button (e.g. previous / next). */
  headerExtra?: React.ReactNode;
  /** A custom header (e.g. a match result); it must contain an element with id={titleId}. */
  header?: React.ReactNode;
  headerClassName?: string;
  titleId?: string;
  closeTestId?: string;
  bodyTestId?: string;
  headerTestId?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
    }
    if (!open && d.open) d.close();
    if (!open) return;
    // The page behind stays where it is while the panel is open.
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
      // Back to what opened the panel, whether it was closed or removed from the page.
      const back = opener.current;
      if (back?.isConnected) requestAnimationFrame(() => back.focus({ preventScroll: true }));
    };
  }, [open]);
  const close = (
    <button type="button" onClick={onClose} autoFocus className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close" data-testid={closeTestId}>
      <X className="h-4 w-4" />
    </button>
  );
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "max-w-none bg-bg-elevated p-0 text-fg shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[1px]",
        // Phones: a bottom sheet. Wider screens: a full-height panel on the right.
        "m-0 mt-auto w-full rounded-t-card border-t border-border-strong motion-safe:rise-in",
        size === "xl" ? "h-[94dvh] max-h-[94dvh]" : "h-auto max-h-[88dvh]",
        "sm:ml-auto sm:mt-0 sm:h-dvh sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0 sm:motion-safe:drawer-in",
        WIDTH[size],
        className,
      )}
      data-testid={testId}
      data-size={size}
    >
      {open ? (
        <div className={cn("flex flex-col pb-safe sm:h-full", size === "xl" ? "h-full" : "max-h-[88dvh] sm:max-h-none")}>
          <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" aria-hidden />
          {header ? (
            <div className={cn("relative shrink-0 border-b border-border", headerClassName)} data-testid={headerTestId}>
              {header}
              <span className="absolute right-2 top-2 flex items-center gap-1 sm:right-3 sm:top-3">
                {headerExtra}
                {close}
              </span>
            </div>
          ) : (
            <div className={cn("flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3", headerClassName)} data-testid={headerTestId}>
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-semibold">
                  {title}
                </h2>
                {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
              </div>
              <span className="flex shrink-0 items-center gap-1">
                {headerExtra}
                {close}
              </span>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5" data-testid={bodyTestId}>
            {children}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
