"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * How much room a detail needs: compact for a short note, standard for a player or a champion,
 * wide for a match (scoreboards, timelines), full for content that genuinely needs the screen.
 * `sheet` is a choice to make (a list to pick from, then Save or Cancel): on a phone it rises from
 * the bottom edge, within reach of the thumb, and the page stays visible above it; wider screens
 * get a compact centred window. `form` is a few fields to type in (signing in): the whole screen on
 * phones, upright or sideways, with its header pinned and the rest scrolling under it, so the
 * on-screen keyboard (see useKeyboardFit) never leaves a field or the button out of reach; wider
 * screens get a compact centred window.
 */
export type ModalSize = "compact" | "standard" | "wide" | "full" | "sheet" | "form";

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
  // Phones: docked to the bottom edge, as tall as its content up to most of the screen; a phone
  // held sideways gets nearly all of its short height. Wider screens: a compact centred window.
  sheet: "w-full max-h-[85dvh] rounded-t-[1.25rem] border-b-0 max-sm:mb-0 max-sm:mt-auto sm:w-[min(30rem,calc(100vw-2rem))] sm:rounded-card sm:border-b short:max-h-[calc(100dvh-0.5rem)]",
  // As tall as its fields on wider screens (fit-content, the browser's own size for a dialog:
  // `auto` would stretch it between the dialog's top and bottom insets).
  form: `h-dvh w-full max-h-none rounded-none border-0 max-sm:pt-safe sm:h-fit sm:max-h-[min(88dvh,44rem)] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-card sm:border ${WHOLE_SCREEN} short:pt-safe`,
};

/** The motion of each size: a sheet slides up from the bottom edge on phones, every window else rises into the centre. */
const MOTION: Partial<Record<ModalSize, string>> = {
  sheet: "motion-safe:sheet-in data-[closing=true]:sheet-out sm:motion-safe:modal-in sm:data-[closing=true]:modal-out backdrop:transition-opacity backdrop:duration-150 data-[closing=true]:backdrop:opacity-0",
};

/**
 * On a phone those windows take the whole screen. One whose own header would fill more than this
 * share of it (the Team player window on a small phone) scrolls as one instead, as every window
 * does in a short window, so its content is never left a strip below the header.
 */
const FLOW_SHARE = 0.4;
/** Phones: below Tailwind's `sm`, where the windows above take the whole screen. */
const PHONE_QUERY = "(max-width: 39.99rem)";

/**
 * The backdrop and motion every modal on the site shares (detail windows and editors alike). The
 * page behind is dimmed, not blurred: a full-screen backdrop filter is redrawn on every frame of the
 * opening motion and was the largest drawing cost measured (see docs/UNIIVERSE_TECHNICAL_HANDOVER.md).
 */
export const MODAL_BACKDROP = "backdrop:bg-[rgb(2_6_23/0.7)] motion-safe:backdrop:fade-in";
export const MODAL_MOTION = "motion-safe:modal-in data-[closing=true]:modal-out data-[closing=true]:backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-150";

/**
 * The close button keeps the top-right corner to itself: a custom header's content stays this far
 * from the corner's controls (the close button, and any Back or previous/next beside it), measured
 * by DetailModal because the close button is larger on touch screens. `CLEAR_OF_CONTROLS` is for
 * content beside them, `BELOW_CONTROLS` for content that starts under them (a header drawn as a
 * picture), `BELOW_CONTROLS_ON_PHONES` for a header that does so only on phones.
 */
const CLEARANCE_PX = 12;
export const CLEAR_OF_CONTROLS = "pr-[var(--modal-clear-right,4.5rem)]";
export const BELOW_CONTROLS = "pt-[var(--modal-clear-top,4.5rem)]";
export const BELOW_CONTROLS_ON_PHONES = "max-sm:pr-4 max-sm:pt-[var(--modal-clear-top,4.5rem)] sm:pr-[var(--modal-clear-right,4.5rem)]";

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
 * What opened a window that has just closed, for a window opened in the same render: one that
 * replaces another (a game opened from a player's Encounters, and Back to them) finds focus on the
 * page itself, the window before it gone, so it takes that window's opener and focus still goes
 * back there when the last of them closes. Cleared on the next frame.
 */
let handedOver: HTMLElement | null = null;

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
  innerScroll = false,
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
  /** The window's own navigation (Back, previous / next): left of the close button, set apart from it by a divider. */
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
  /**
   * The content scrolls itself (an editor with a fixed preview and toolbar): the body is a
   * fixed-height column that never scrolls, on every screen, short windows and phones included,
   * and the content gives one area of its own `min-h-0 flex-1 overflow-y-auto`.
   */
  innerScroll?: boolean;
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
  const headerRef = React.useRef<HTMLDivElement>(null);
  // Scroll as one on a phone (see FLOW_SHARE); measured once the window is on the page.
  const [flow, setFlow] = React.useState(false);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setSettled(false);
      setFlow(false);
    }
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

  const custom = header != null;
  /** The header stays put on every screen, short windows included, and only the body scrolls (see `form`). */
  const pinned = size === "form";
  // How much room the corner controls take, for CLEAR_OF_CONTROLS and BELOW_CONTROLS: measured
  // before the window is first drawn, because the close button is larger on touch screens and a
  // Back label varies. Layout sizes, not on-screen boxes, so the opening motion's scale is no matter.
  const controlsRef = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const d = ref.current;
    const c = controlsRef.current;
    if (!open || !custom || !d || !c) return;
    const measure = () => {
      const style = getComputedStyle(c);
      // An absolute cluster is placed within the header. A fixed one (a short window, or a phone
      // window that scrolls as one) is placed within the whole-screen window, whose padding keeps
      // the header clear of the notch, so that padding is not the header's to clear.
      const dialogStyle = style.position === "fixed" ? getComputedStyle(d) : null;
      const right = (parseFloat(style.right) || 0) - (dialogStyle ? parseFloat(dialogStyle.paddingRight) || 0 : 0);
      const top = (parseFloat(style.top) || 0) - (dialogStyle ? parseFloat(dialogStyle.paddingTop) || 0 : 0);
      d.style.setProperty("--modal-clear-right", `${Math.max(0, right) + c.offsetWidth + CLEARANCE_PX}px`);
      d.style.setProperty("--modal-clear-top", `${Math.max(0, top) + c.offsetHeight + CLEARANCE_PX}px`);
    };
    measure();
    // The cluster's own size (a Back label arriving), and the screen's (turning a phone moves the
    // cluster between placements). Not the window's size: the header's padding changes that.
    const observer = new ResizeObserver(measure);
    observer.observe(c);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [open, custom, flow]);
  React.useLayoutEffect(() => {
    const d = ref.current;
    const h = headerRef.current;
    if (!open || !custom || innerScroll || pinned || size === "compact" || !d || !h) return;
    const phone = window.matchMedia(PHONE_QUERY);
    // A ResizeObserver reports the first sizes before the window is first drawn, then every change
    // (content arriving in the header, the phone turning).
    const check = () => setFlow(phone.matches && h.offsetHeight > d.clientHeight * FLOW_SHARE);
    const observer = new ResizeObserver(check);
    observer.observe(d);
    observer.observe(h);
    phone.addEventListener("change", check);
    return () => {
      observer.disconnect();
      phone.removeEventListener("change", check);
    };
  }, [open, custom, innerScroll, pinned, size]);

  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : handedOver;
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
      // Back to what opened the window, whether it was closed or removed from the page (or to the
      // window replacing it, see handedOver).
      const back = opener.current;
      handedOver = back;
      requestAnimationFrame(() => {
        if (handedOver === back) handedOver = null;
        if (back?.isConnected) back.focus({ preventScroll: true });
      });
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

  // The close button alone in the top-right corner: the window's own navigation sits left of it,
  // past a divider, and nothing in the header comes within CLEARANCE_PX of either.
  const controls = (
    <>
      {headerExtra}
      {headerExtra ? <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border-strong" data-testid="modal-controls-divider" /> : null}
      <button type="button" onClick={requestClose} autoFocus aria-keyshortcuts="Escape" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close" data-testid={closeTestId}>
        <X className="h-4 w-4" />
      </button>
    </>
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
        if (e.target === ref.current && (e.animationName === "modal-in" || e.animationName === "sheet-in")) settle();
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-closing={closing || undefined}
      className={cn(
        "m-auto max-w-none border border-border-strong bg-bg-elevated p-0 px-safe text-fg shadow-2xl shadow-black/50 open:flex open:flex-col",
        !innerScroll && !pinned && "short:overflow-y-auto short:overscroll-contain",
        flow ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
        MODAL_BACKDROP,
        MOTION[size] ?? MODAL_MOTION,
        SIZE[size],
        className,
      )}
      data-testid={testId}
      data-size={size}
      data-flow={flow || undefined}
    >
      {open ? (
        <>
          {/* Short windows (a phone held sideways) scroll as one: a large header would otherwise leave
              the body a strip. So does a phone window whose header would fill much of the screen
              (FLOW_SHARE). A custom header then scrolls away while its controls float at the top
              (under a bar that covers the status bar of the installed app); a plain title bar
              stays pinned, and so does the footer. */}
          {flow ? <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)] bg-bg-elevated/90" /> : null}
          {header ? (
            <div ref={headerRef} className={cn("relative shrink-0 border-b border-border", headerClassName)} data-testid={headerTestId}>
              {header}
              <span
                ref={controlsRef}
                data-testid="modal-controls"
                className={cn(
                  "flex items-center gap-1",
                  flow
                    ? "fixed right-[max(0.5rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+0.5rem)] z-20 rounded-lg bg-bg-elevated/85 shadow-lg backdrop-blur"
                    : innerScroll || pinned
                      ? "absolute right-2 top-2 sm:right-3 sm:top-3"
                      : "absolute right-2 top-2 sm:right-3 sm:top-3 short:fixed short:right-[max(0.5rem,env(safe-area-inset-right))] short:top-2 short:z-20 short:rounded-lg short:bg-bg-elevated/85 short:shadow-lg short:backdrop-blur",
                )}
              >
                {controls}
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
              <span className="flex shrink-0 items-center gap-1" data-testid="modal-controls">
                {controls}
              </span>
            </div>
          )}
          <div className={cn(innerScroll ? "flex min-h-0 flex-1 flex-col overflow-hidden" : ["px-4 py-4 pb-safe sm:px-6 sm:py-5", flow ? "flex-none" : pinned ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "min-h-0 flex-1 overflow-y-auto overscroll-contain short:flex-none short:overflow-y-visible"], bodyClassName)} data-testid={bodyTestId}>
            <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>
          </div>
          {footer ? <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-bg-elevated px-4 py-3 pb-safe sm:px-6", !innerScroll && !pinned && "short:sticky short:bottom-0 short:z-10 short:mt-auto", flow && "sticky bottom-0 z-10 mt-auto")}>{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
