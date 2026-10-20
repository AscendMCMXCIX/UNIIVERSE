"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * How much room a detail needs: compact for a short note, standard for a player or a champion,
 * wide for a match (scoreboards, timelines), full for content that genuinely needs the screen.
 */
export type ModalSize = "compact" | "standard" | "wide" | "full";

/** The whole screen: phones, and any short window (a phone held sideways), where a centred window would leave its content a strip. */
const WHOLE_SCREEN = "short:h-dvh short:w-full short:max-h-none short:rounded-none short:border-0";

const SIZE: Record<ModalSize, string> = {
  // Phones: a centred card with a margin (short content).
  compact: "w-[calc(100vw-1.5rem)] max-h-[85dvh] rounded-card sm:w-[min(28rem,calc(100vw-2rem))] short:max-h-[calc(100dvh-1rem)]",
  // Phones: the whole screen (a small window would be hard to use); wider screens: a centred window.
  standard: `h-dvh w-full max-h-none rounded-none max-sm:pt-safe sm:h-auto sm:max-h-[min(88dvh,56rem)] sm:w-[min(42rem,calc(100vw-3rem))] sm:rounded-card ${WHOLE_SCREEN}`,
  // A fixed height on wide screens, so switching tabs inside never makes the window jump.
  wide: `h-dvh w-full max-h-none rounded-none max-sm:pt-safe sm:h-[min(90dvh,58rem)] sm:w-[min(76rem,calc(100vw-3rem))] sm:rounded-card ${WHOLE_SCREEN}`,
  full: `h-dvh w-full max-h-none rounded-none max-sm:pt-safe sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:rounded-card ${WHOLE_SCREEN}`,
};

/**
 * The backdrop and motion every modal on the site shares (detail windows and editors alike). The
 * page behind is dimmed, not blurred: a full-screen backdrop filter is redrawn on every frame of the
 * opening motion and was the largest drawing cost measured (see docs/UNIIVERSE_TECHNICAL_HANDOVER.md).
 */
export const MODAL_BACKDROP = "backdrop:bg-[rgb(2_6_23/0.7)] motion-safe:backdrop:fade-in";
export const MODAL_MOTION = "motion-safe:modal-in data-[closing=true]:modal-out data-[closing=true]:backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-150";

/** How long the closing motion runs before the window is removed (matches modal-out). */
const EXIT_MS = 140;
/**
 * When the window counts as open for its content (see AfterOpen): modal-in runs 180 ms on an
 * ease-out curve, which is over 90% of the way by 120 ms; the rest is a barely visible settle.
 */
const SETTLE_MS = 120;

/** True once the window has finished opening (immediately for reduced motion). */
const SettledContext = React.createContext(true);

/**
 * Heavy window content waits until the opening motion is over, so the first frames hold only the
 * window's shell and the motion never stalls on rendering, layout or images. Until then (and for
 * as long as the content itself is not ready) `fallback` is shown: a light loading state. The
 * content then renders as a transition (it can yield to input) and fades in.
 */
export function AfterOpen({ children, fallback = null, ready = true }: { children: React.ReactNode; fallback?: React.ReactNode; /** False while the content's data is still loading. */ ready?: boolean }) {
  const settled = React.useContext(SettledContext);
  return settled && ready ? <div className="motion-safe:fade-in">{children}</div> : <>{fallback}</>;
}

/**
 * The site's one window for contextual details (a player, a match, an analysis): it rises into
 * the centre of the screen over a dimmed page, which stays where it was underneath. Built on the
 * native <dialog>, so focus is trapped and the rest of the page is inert. Escape, the close button
 * and a click on the backdrop close it with a short fade (instant for reduced motion); focus then
 * returns to whatever opened it, and the page behind never scrolls or shifts while it is open.
 * `canClose` lets a window with unsaved edits ask first.
 */
export function DetailModal({
  open,
  onClose,
  canClose,
  title,
  description,
  children,
  className,
  testId,
  size = "standard",
  headerExtra,
  header,
  headerClassName,
  titleId: titleIdProp,
  closeTestId,
  bodyTestId,
  headerTestId,
  bodyClassName,
  footer,
  onSettled,
}: {
  open: boolean;
  onClose: () => void;
  /** Return false to keep the window open (e.g. after declining to discard unsaved edits). */
  canClose?: () => boolean;
  /** The window's name; shown unless a custom header is given (then it labels the dialog only). */
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  testId?: string;
  size?: ModalSize;
  /** Controls beside the close button (e.g. previous / next). */
  headerExtra?: React.ReactNode;
  /** A custom header (e.g. a match result); it must contain an element with id={titleId}. */
  header?: React.ReactNode;
  headerClassName?: string;
  titleId?: string;
  closeTestId?: string;
  bodyTestId?: string;
  headerTestId?: string;
  bodyClassName?: string;
  footer?: React.ReactNode;
  /** Called once the opening motion is over (see AfterOpen), e.g. to show content kept back until then. */
  onSettled?: () => void;
}) {
  const generated = React.useId();
  const titleId = titleIdProp ?? `modal-title-${generated}`;
  const descriptionId = description ? `modal-desc-${generated}` : undefined;
  const ref = React.useRef<HTMLDialogElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const [closing, setClosing] = React.useState(false);
  const [settled, setSettled] = React.useState(false);
  // A window that closes (or hides behind another) opens with its motion again next time.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setSettled(false);
  }
  const latest = React.useRef({ onClose, canClose, onSettled });
  React.useLayoutEffect(() => {
    latest.current = { onClose, canClose, onSettled };
  });
  const settle = React.useCallback(
    () =>
      React.startTransition(() => {
        setSettled(true);
        latest.current.onSettled?.();
      }),
    [],
  );
  const timer = React.useRef<number | null>(null);
  /** Set while this component closes the dialog itself, so the native close event is not a second request. */
  const selfClosing = React.useRef(false);

  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
    }
    if (!open && d.open) {
      selfClosing.current = true;
      d.close();
    }
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settleTimer = window.setTimeout(settle, reduce ? 0 : SETTLE_MS);
    // The page behind stays exactly where it is: no scrolling, and no shift when the scrollbar goes.
    const root = document.documentElement;
    const body = document.body;
    const gap = window.innerWidth - root.clientWidth;
    const prev = { overflow: root.style.overflow, padding: body.style.paddingRight };
    root.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      window.clearTimeout(settleTimer);
      root.style.overflow = prev.overflow;
      body.style.paddingRight = prev.padding;
      // Back to what opened the window, whether it was closed or removed from the page.
      const back = opener.current;
      if (back?.isConnected) requestAnimationFrame(() => back.focus({ preventScroll: true }));
    };
  }, [open, settle]);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const requestClose = React.useCallback(() => {
    if (timer.current !== null) return;
    if (latest.current.canClose && !latest.current.canClose()) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      latest.current.onClose();
      return;
    }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      latest.current.onClose();
    }, EXIT_MS);
  }, []);

  const close = (
    <button type="button" onClick={requestClose} autoFocus className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close" data-testid={closeTestId}>
      <X className="h-4 w-4" />
    </button>
  );
  return (
    <dialog
      ref={ref}
      // Escape asks to close (so the motion runs and unsaved edits can be kept).
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      // A close the browser forced (e.g. a repeated Escape) still reaches the owner.
      onClose={() => {
        if (selfClosing.current) {
          selfClosing.current = false;
          return;
        }
        if (timer.current === null) latest.current.onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
      onAnimationEnd={(e) => {
        if (e.target === ref.current && e.animationName === "modal-in") settle();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-closing={closing || undefined}
      className={cn(
        "m-auto max-w-none overflow-hidden border border-border-strong bg-bg-elevated p-0 px-safe text-fg shadow-2xl shadow-black/50 open:flex open:flex-col short:overflow-y-auto short:overscroll-contain",
        MODAL_BACKDROP,
        MODAL_MOTION,
        SIZE[size],
        className,
      )}
      data-testid={testId}
      data-size={size}
    >
      {open ? (
        <>
          {/* Short windows (a phone held sideways) scroll as one: a large header would otherwise leave
              the body a strip. A custom header then scrolls away while its controls float at the
              top; a plain title bar stays pinned, and so does the footer. */}
          {header ? (
            <div className={cn("relative shrink-0 border-b border-border", headerClassName)} data-testid={headerTestId}>
              {header}
              <span className="absolute right-2 top-2 flex items-center gap-1 sm:right-3 sm:top-3 short:fixed short:right-[max(0.5rem,env(safe-area-inset-right))] short:top-2 short:z-20 short:rounded-lg short:bg-bg-elevated/85 short:shadow-lg short:backdrop-blur">
                {headerExtra}
                {close}
              </span>
            </div>
          ) : (
            <div className={cn("flex shrink-0 items-start justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3 sm:px-5 sm:py-4 short:sticky short:top-0 short:z-10", headerClassName)} data-testid={headerTestId}>
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold leading-tight">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <span className="flex shrink-0 items-center gap-1">
                {headerExtra}
                {close}
              </span>
            </div>
          )}
          <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-safe sm:px-6 sm:py-5 short:flex-none short:overflow-y-visible", bodyClassName)} data-testid={bodyTestId}>
            <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>
          </div>
          {footer ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-bg-elevated px-4 py-3 pb-safe sm:px-6 short:sticky short:bottom-0 short:z-10 short:mt-auto">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
