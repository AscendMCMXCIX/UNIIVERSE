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
 * screens get a compact centred window. `screen` is a whole screen of its own wherever it is used
 * (the phone's account menu): fixed to the screen's four edges, its header in place under the
 * status bar and only its body scrolling, when it must.
 *
 * Every size is placed and sized by the screen it is fixed to (its containing block: insets, and
 * percentages of it), not by viewport units (vh, svh, dvh, lvh, vw) or by measuring the viewport
 * from script, so a window's size and its place come from the same box and can never disagree.
 * overlay-sizing.test.ts keeps it so. A window's body grows from its content, never from nothing:
 * see BODY_SCROLLS, the reason the account menu was a strip on the owner's iPhone.
 */
export type ModalSize = "compact" | "standard" | "wide" | "full" | "sheet" | "form" | "screen";

/**
 * A window's body: as tall as its content, growing into whatever room the window has to spare, and
 * shrinking to scroll once the window is as tall as it may be (flex: 1 1 auto, with min-height 0).
 *
 * Never `flex-1`, a body that grows from nothing (a zero flex basis). Safari 26 and earlier (iOS,
 * iPadOS and macOS 26) work out the height of a window that is as tall as its content (a dialog's
 * own fit-content height: every sheet, the compact windows, and the centred windows of wider
 * screens) as if such a body were empty, so the window collapses to its header, its paddings and
 * its footer. That is what the owner's iPhone showed on 10 Nov: the account menu a 95pt strip (its
 * border, 65pt header and 28pt of body padding, nothing else) and, before it, the account sheet a
 * 124pt strip at the foot of the screen. WebKit 26.0 and the iOS 26 Simulator draw exactly that, and
 * collapse most other sheets, the compact windows and the centred windows of wider screens the same
 * way (a sheet with a tall control was sometimes saved by scrolling as one, SHEET_SPARE_REM). WebKit
 * 27 and Chromium draw both bodies alike, which is why no test saw it (docs/RESPONSIVE.md, "Safari
 * 26"). overlay-sizing.test.ts keeps it so.
 */
const BODY_SCROLLS = "min-h-0 flex-auto overflow-y-auto overscroll-contain";

/**
 * The whole screen: phones, and any short window (a phone held sideways), where a centred window
 * would leave its content a strip. Stretched between the dialog's own top and bottom insets (the
 * browser's `inset-block: 0` for a modal dialog), so the screen it is fixed to gives its height.
 */
const WHOLE_SCREEN = "short:h-auto short:w-full short:max-h-none short:rounded-none short:border-0";

const SIZE: Record<ModalSize, string> = {
  // Phones: a centred card with a margin (short content), at most 85% of the screen's height.
  compact: "w-[calc(100%-1.5rem)] max-h-[85%] rounded-card sm:w-[min(28rem,calc(100%-2rem))] short:max-h-[calc(100%-1rem)]",
  // Phones: the whole screen (a small window would be hard to use), stretched between the dialog's
  // top and bottom insets; wider screens: a centred window as tall as its content (fit-content:
  // `auto` would stretch it there too, leaving a short window mostly empty), up to most of the
  // screen, then the body scrolls.
  standard: `h-auto w-full max-h-none rounded-none max-sm:pt-safe sm:h-fit sm:max-h-[min(88%,56rem)] sm:w-[min(42rem,calc(100%-3rem))] sm:rounded-card ${WHOLE_SCREEN}`,
  // A fixed height on wide screens, so switching tabs inside never makes the window jump.
  wide: `h-auto w-full max-h-none rounded-none max-sm:pt-safe sm:h-[min(90%,58rem)] sm:w-[min(76rem,calc(100%-3rem))] sm:rounded-card ${WHOLE_SCREEN}`,
  full: `h-auto w-full max-h-none rounded-none max-sm:pt-safe sm:h-[calc(100%-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-card ${WHOLE_SCREEN}`,
  // Phones, and any short window (a phone held sideways): docked to the bottom edge, as tall as its
  // content up to the screen's height less a strip of the page above it (to tap away). The cap is a
  // share of the screen the sheet is fixed to, which does not move while a sheet is open (the page
  // behind cannot scroll), rather than svh, which iOS has reported less the safe areas in installed
  // apps (WebKit bug 254868). Sideways it spans up to 44rem, centred. Taller wider screens: a compact
  // centred window.
  sheet: "w-full max-h-[calc(100%-env(safe-area-inset-top)-2.5rem)] rounded-t-[1.25rem] border-b-0 max-sm:mb-0 max-sm:mt-auto sm:w-[min(30rem,calc(100%-2rem))] sm:max-h-[min(88%,52rem)] sm:rounded-card sm:border-b short:mb-0 short:mt-auto short:w-[min(44rem,100%)] short:max-h-[calc(100%-0.5rem)] short:rounded-b-none short:border-b-0",
  // As tall as its fields on wider screens (fit-content, the browser's own size for a dialog:
  // `auto` would stretch it between the dialog's top and bottom insets).
  form: `h-auto w-full max-h-none rounded-none border-0 max-sm:pt-safe sm:h-fit sm:max-h-[min(88%,44rem)] sm:w-[min(28rem,calc(100%-2rem))] sm:rounded-card sm:border ${WHOLE_SCREEN} short:pt-safe`,
  // The whole screen at every width it is used at: fixed to its four edges (inset 0, no height of
  // its own, nothing measured), under the status bar and the Dynamic Island (pt-safe), clear of the
  // notch sideways (the dialog's px-safe). Its content keeps a readable width (mobile-nav.tsx).
  screen: "inset-0 h-auto w-auto max-h-none rounded-none border-0 pt-safe",
};

/**
 * The motion of each size: a sheet slides up from the bottom edge on phones, a screen rises a little
 * into place, every window else rises into the centre. A screen drops its motion once it has run
 * (`data-entered`, see DetailModal), so whatever the browser does with an animation, the screen
 * rests where its styles put it; no frame of its motion is more than 1rem from there. Each fades its
 * dimmed backdrop out as it closes, so the page is never left dimmed for a frame and then bright.
 */
const MOTION: Partial<Record<ModalSize, string>> = {
  sheet: "motion-safe:sheet-in data-[closing=true]:sheet-out sm:motion-safe:modal-in sm:data-[closing=true]:modal-out short:motion-safe:sheet-in short:data-[closing=true]:sheet-out backdrop:transition-opacity backdrop:duration-150 data-[closing=true]:backdrop:opacity-0",
  screen: "motion-safe:not-data-[entered=true]:screen-in data-[closing=true]:screen-out backdrop:transition-opacity backdrop:duration-150 data-[closing=true]:backdrop:opacity-0",
};
/**
 * How long a screen's opening motion may take before it is dropped regardless (screen-in runs
 * 200 ms): the screen is then at rest even if the browser never reported the motion's end.
 */
const SCREEN_ENTER_MS = 400;

/**
 * On a phone those windows take the whole screen. One whose own header would fill more than this
 * share of it (the Team player window on a small phone) scrolls as one instead, as every window
 * does in a short window, so its content is never left a strip below the header.
 */
const FLOW_SHARE = 0.4;
/** Phones: below Tailwind's `sm`, where the windows above take the whole screen. */
const PHONE_QUERY = "(max-width: 39.99rem)";
/**
 * A docked sheet keeps its header and footer in place and only its body scrolls. Where they would
 * leave the body less room than the tallest control in it needs, with this much to spare (in rem),
 * the whole sheet scrolls as one instead, like a page, its header and footer included: large text,
 * or a page zoomed in, on a phone held sideways, where the account sheet's header and footer took
 * most of its height and its tiles, in the strip between them, could never be shown whole.
 */
const SHEET_SPARE_REM = 0.25;
/** What a sheet's body holds that must be seen whole to be used: its controls. */
const SHEET_CONTROLS = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";

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

/** Closes the window this is rendered in, with its closing motion, as the close button does. */
const CloseContext = React.createContext<() => void>(() => undefined);

/**
 * The way a window's own controls close it (a sheet's Done, a form's Cancel): the same request as
 * the close button and Escape, so the window leaves with its motion (and asks `canClose` first)
 * instead of vanishing when its owner stops rendering it.
 */
export function useModalClose(): () => void {
  return React.useContext(CloseContext);
}

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

/** Where a sheet is docked to the bottom edge (SIZE.sheet): phones, and short windows. */
const DOCKED_QUERY = "(max-width: 39.99rem), (max-height: 480px)";
/** Distance a finger must travel before a touch counts as a drag (or a scroll), in px. */
const DRAG_SLOP = 6;
/** A sheet pulled down further than this share of its height (or 140px) closes when let go. */
const DISMISS_SHARE = 0.3;
/** ... or flicked down faster than this, in px per ms, over the last VELOCITY_WINDOW ms of the pull. */
const DISMISS_VELOCITY = 0.5;
const VELOCITY_WINDOW = 100;

/**
 * A docked sheet follows a finger pulling it down, and closes when let go far enough down or with a
 * flick (with its closing motion, from where the finger left it); otherwise it settles back. A pull
 * that starts in the sheet's body while the body is scrolled away from its top scrolls the body
 * instead, as a native sheet does. Touches that would move nothing inside the sheet (on its header,
 * on content that does not scroll, on the dimmed page around it) are kept from moving the page
 * behind: no rubber band, no browser toolbars sliding, which on iOS also resized the sheet. Taps are
 * untouched, so a tap on the dimmed page still closes the sheet and every link still works.
 *
 * Without `pull` (a screen, which has nothing to pull) only that last part stays, at every width: a
 * touch scrolls the screen's body where the body scrolls, and moves nothing anywhere else.
 */
function useSheetDrag(ref: React.RefObject<HTMLDialogElement | null>, enabled: boolean, onDismiss: () => void, pull = true) {
  React.useEffect(() => {
    const d = ref.current;
    if (!enabled || !d) return;
    const docked = window.matchMedia(DOCKED_QUERY);
    let startX = 0;
    let startY = 0;
    let dy = 0;
    // The pull's recent positions, for its speed as the finger leaves (a flick is judged by its end).
    let samples: Array<{ t: number; y: number }> = [];
    // idle: no touch; pending: too small a move to tell; drag: the sheet follows the finger; pass:
    // the browser scrolls the sheet's body; block: nothing moves, for the rest of the touch.
    let mode: "idle" | "pending" | "drag" | "pass" | "block" = "idle";
    let scroller: HTMLElement | null = null;
    let settleTimer = 0;
    const reset = () => {
      d.style.removeProperty("transform");
      d.style.removeProperty("transition");
    };
    const canScroll = (el: HTMLElement | null) => !!el && el.scrollHeight > el.clientHeight + 1;
    // A page pinched to zoom: a finger pans the zoomed view to the part out of sight (the browser's
    // own move), so nothing is pulled or held while it is zoomed in.
    const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if ((pull && !docked.matches) || e.touches.length !== 1 || !t || zoomed()) {
        mode = "pass";
        return;
      }
      window.clearTimeout(settleTimer);
      startX = t.clientX;
      startY = t.clientY;
      dy = 0;
      samples = [{ t: e.timeStamp, y: t.clientY }];
      mode = "pending";
      // The dimmed page around the sheet is the dialog itself (its ::backdrop); content is inside it.
      scroller = e.target === d ? null : ((e.target as Element | null)?.closest?.("[data-sheet-scroll]") as HTMLElement | null);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (mode === "idle" || mode === "pass" || !t) return;
      const moveX = t.clientX - startX;
      const moveY = t.clientY - startY;
      if (mode === "pending") {
        if (Math.abs(moveX) < DRAG_SLOP && Math.abs(moveY) < DRAG_SLOP) return;
        const scrollable = canScroll(scroller);
        const onBackdrop = e.target === d;
        if (pull && !onBackdrop && moveY > 0 && Math.abs(moveY) > Math.abs(moveX) && !(scrollable && scroller!.scrollTop > 0)) {
          mode = "drag";
          d.style.transition = "none";
        } else {
          // Not a pull down: a scrollable body scrolls itself; anything else moves nothing.
          mode = scrollable && !onBackdrop ? "pass" : "block";
        }
      }
      if (mode === "pass") return;
      if (e.cancelable) e.preventDefault();
      if (mode === "block") return;
      dy = Math.max(0, moveY);
      samples.push({ t: e.timeStamp, y: t.clientY });
      if (samples.length > 8) samples.shift();
      d.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      const was = mode;
      mode = "idle";
      if (was !== "drag") return;
      const last = samples[samples.length - 1]!;
      const from = samples.find((p) => last.t - p.t <= VELOCITY_WINDOW) ?? last;
      const velocity = (last.y - from.y) / Math.max(1, last.t - from.t);
      if (dy > Math.min(140, d.offsetHeight * DISMISS_SHARE) || velocity > DISMISS_VELOCITY) {
        // Closes with sheet-out from this offset (its keyframes have no start), or at once for reduced motion.
        onDismiss();
        return;
      }
      d.style.transition = "transform 180ms var(--ease-emphasized)";
      d.style.removeProperty("transform");
      settleTimer = window.setTimeout(reset, 200);
    };
    d.addEventListener("touchstart", onStart, { passive: true });
    d.addEventListener("touchmove", onMove, { passive: false });
    d.addEventListener("touchend", onEnd);
    d.addEventListener("touchcancel", onEnd);
    return () => {
      window.clearTimeout(settleTimer);
      d.removeEventListener("touchstart", onStart);
      d.removeEventListener("touchmove", onMove);
      d.removeEventListener("touchend", onEnd);
      d.removeEventListener("touchcancel", onEnd);
      reset();
    };
  }, [ref, enabled, onDismiss, pull]);
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
  sheetWidth = "standard",
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
  /** A sheet's width where it is a centred window (taller wider screens): wide for an editor with a table (48rem). */
  sheetWidth?: "standard" | "wide";
  /**
   * The content scrolls itself (an editor with a fixed preview and toolbar): the body is a
   * fixed-height column that never scrolls, on every screen, short windows and phones included,
   * and the content gives one area of its own `min-h-0 flex-1 overflow-y-auto`. Only with a size
   * whose height is fixed (wide, full): in a window as tall as its content (compact, sheet, standard
   * and form from sm) that area would grow from nothing, which Safari 26 draws empty (BODY_SCROLLS).
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
  const grabberRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);
  // Scroll as one on a phone (see FLOW_SHARE), or a docked sheet with too little room for its body
  // (SHEET_SPARE_REM); measured once the window is on the page.
  const [flow, setFlow] = React.useState(false);
  // A screen's opening motion has run (or been given up on): its styles drop the motion (MOTION.screen).
  const [entered, setEntered] = React.useState(false);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setSettled(false);
      setFlow(false);
      setEntered(false);
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
  /**
   * A sheet is docked to the bottom edge on phones and in short windows, its header and footer in
   * place and only its body scrolling (one scroll area, inside the sheet). Where that would leave
   * its body too little room (SHEET_SPARE_REM), the whole sheet is the one scroll area instead.
   */
  const docked = size === "sheet";
  /**
   * A screen fills the screen it is fixed to (SIZE.screen), its header in place under the status bar
   * and only its body scrolling when it must (large text, a phone held sideways, a small phone), so
   * the close button never scrolls away. Nothing to pull: a touch that would move nothing inside it
   * moves nothing behind it (useSheetDrag without `pull`).
   */
  const screen = size === "screen";
  // The page behind keeps its place while a screen is open, whatever a browser does as the screen
  // opens or while it is open (revealing the control it focuses, a viewport that settles): the page's
  // position is noted before the screen is shown (layout effects run before the effect that shows
  // it) and put back whenever anything moves it while the screen is on the page. No browser run here
  // moved it; this makes "the page never moves" a guarantee rather than an observation. The page
  // cannot be scrolled by hand meanwhile (the scroll lock below), so nothing a member did is undone.
  React.useLayoutEffect(() => {
    const d = ref.current;
    if (!open || !screen || !d) return;
    const x = window.scrollX;
    const y = window.scrollY;
    const keep = () => {
      if (d.isConnected && (window.scrollX !== x || window.scrollY !== y)) window.scrollTo({ left: x, top: y, behavior: "instant" });
    };
    window.addEventListener("scroll", keep);
    const frame = requestAnimationFrame(keep);
    return () => {
      window.removeEventListener("scroll", keep);
      cancelAnimationFrame(frame);
    };
  }, [open, screen]);
  // The screen's opening motion is dropped once it has run, or after SCREEN_ENTER_MS whatever happened
  // to it (onAnimationEnd below ends it sooner): a motion the browser left unfinished, or drew
  // part-way, can never hold the screen anywhere but where its styles put it. At once for reduced motion.
  React.useEffect(() => {
    if (!open || !screen) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setEntered(true), reduce ? 0 : SCREEN_ENTER_MS);
    return () => window.clearTimeout(t);
  }, [open, screen]);
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
    if (!open || !custom || innerScroll || pinned || docked || screen || size === "compact" || !d || !h) return;
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
  }, [open, custom, innerScroll, pinned, docked, screen, size]);
  // A docked sheet whose header and footer would leave its body less room than the body's tallest
  // control needs, with SHEET_SPARE_REM to spare, scrolls as one. The room is the sheet less its
  // handle, header and footer, which is the same whichever way it scrolls, so the choice holds once
  // made; it is made again on every change of size (the text size, the phone turning, content
  // arriving), reported before the sheet is first drawn.
  React.useLayoutEffect(() => {
    const d = ref.current;
    const body = bodyRef.current;
    if (!open || !docked || innerScroll || !d || !body) return;
    const query = window.matchMedia(DOCKED_QUERY);
    const check = () => {
      const room = d.clientHeight - [grabberRef.current, headerRef.current, footerRef.current].reduce((sum, el) => sum + (el?.offsetHeight ?? 0), 0);
      const overflows = d.scrollHeight > d.clientHeight + 1 || body.scrollHeight > body.clientHeight + 1;
      let tallest = 0;
      for (const el of body.querySelectorAll<HTMLElement>(SHEET_CONTROLS)) tallest = Math.max(tallest, el.offsetHeight);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setFlow(query.matches && overflows && room < tallest + SHEET_SPARE_REM * rem);
    };
    const observer = new ResizeObserver(check);
    for (const el of [d, body, ...body.children, headerRef.current, footerRef.current]) if (el) observer.observe(el);
    query.addEventListener("change", check);
    return () => {
      observer.disconnect();
      query.removeEventListener("change", check);
    };
  }, [open, docked, innerScroll]);

  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const active = document.activeElement;
      opener.current = active instanceof HTMLElement && active !== document.body ? active : handedOver;
      d.showModal();
      // A screen takes the focus itself (tabIndex -1, no ring), so nothing on it is lit up as it
      // opens; Tab then reaches its close button and its rows in order.
      if (screen) d.focus({ preventScroll: true });
    }
    if (!open && d.open) {
      selfClosing.current = true;
      d.close();
    }
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const settleTimer = window.setTimeout(settle, reduce ? 0 : SETTLE_MS);
    // The page behind stays exactly where it is: no scrolling, and no shift when the scrollbar goes.
    // The scrollbar's width is the window's less the root's, believed only up to a scrollbar's width
    // (24px): a phone has none, and a browser that reports the window's size wrongly cannot push the
    // page sideways.
    const root = document.documentElement;
    const body = document.body;
    const gap = Math.min(24, window.innerWidth - root.clientWidth);
    const prev = { overflow: root.style.overflow, overscroll: root.style.overscrollBehavior, padding: body.style.paddingRight };
    root.style.overflow = "hidden";
    // No rubber band or pull-to-refresh on the page either (iOS and Android browsers).
    root.style.overscrollBehavior = "none";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      window.clearTimeout(settleTimer);
      root.style.overflow = prev.overflow;
      root.style.overscrollBehavior = prev.overscroll;
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
  }, [open, settle, screen]);

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
  useSheetDrag(ref, open && (docked || screen), requestClose, docked);

  // The close button alone in the top-right corner: the window's own navigation sits left of it,
  // past a divider, and nothing in the header comes within CLEARANCE_PX of either.
  const controls = (
    <>
      {headerExtra}
      {headerExtra ? <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border-strong" data-testid="modal-controls-divider" /> : null}
      {/* A screen's close button is a quiet 36px circle whose touch area reaches 44px (touch-target),
          and it is not focused as the screen opens (the screen itself is): it once sat in a 48px
          ring of accent at the top of the account menu, the loudest thing on it. */}
      <button
        type="button"
        onClick={requestClose}
        autoFocus={!screen}
        aria-keyshortcuts="Escape"
        className={cn(
          "grid shrink-0 place-items-center transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-accent",
          screen ? "touch-target h-9 w-9 rounded-full bg-surface-2/70 text-fg-muted hover:bg-surface-2" : "h-9 w-9 rounded-md text-fg-subtle hover:bg-surface-2 pointer-coarse:h-11 pointer-coarse:w-11",
        )}
        aria-label="Close"
        data-testid={closeTestId}
      >
        <X className={screen ? "h-[1.125rem] w-[1.125rem]" : "h-4 w-4"} />
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
        if (e.target !== ref.current) return;
        if (e.animationName === "modal-in" || e.animationName === "sheet-in" || e.animationName === "screen-in") settle();
        if (e.animationName === "screen-in") setEntered(true);
      }}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-closing={closing || undefined}
      // Closing ends the opening motion too, so the closing one is the only one left to run.
      data-entered={screen && (entered || closing) ? "true" : undefined}
      className={cn(
        "max-w-none border border-border-strong bg-bg-elevated p-0 text-fg shadow-2xl shadow-black/50 open:flex open:flex-col",
        // A screen is fixed to the screen's edges (SIZE.screen): no auto margins. Its own focus (it
        // takes the focus as it opens, see below) draws no ring: the close button is not lit up.
        screen ? "m-0 px-safe outline-none" : "m-auto px-safe",
        !innerScroll && !pinned && !docked && !screen && "short:overflow-y-auto short:overscroll-contain",
        flow ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
        MODAL_BACKDROP,
        MOTION[size] ?? MODAL_MOTION,
        size === "sheet" && sheetWidth === "wide" ? SIZE.sheet.replace("sm:w-[min(30rem,calc(100%-2rem))]", "sm:w-[min(48rem,calc(100%-2rem))]") : SIZE[size],
        className,
      )}
      data-testid={testId}
      data-size={size}
      tabIndex={screen ? -1 : undefined}
      data-flow={flow || undefined}
      // What a pull on a docked sheet scrolls before it drags the sheet (useSheetDrag): the body, or
      // the whole sheet while it scrolls as one.
      data-sheet-scroll={docked && flow ? "" : undefined}
    >
      {open ? (
        <CloseContext.Provider value={requestClose}>
          {/* Short windows (a phone held sideways) scroll as one: a large header would otherwise leave
              the body a strip. So does a phone window whose header would fill much of the screen
              (FLOW_SHARE). A custom header then scrolls away while its controls float at the top
              (under a bar that covers the status bar of the installed app); a plain title bar
              stays pinned, and so does the footer. A docked sheet scrolls as one only where its
              header and footer would leave its body too little room (SHEET_SPARE_REM), and then
              like a page: its header, the close button with it, goes up with the body, and its
              footer comes after the body's last line (a sheet is docked below the status bar, so
              no bar covers it). */}
          {flow && !docked ? <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-20 h-[env(safe-area-inset-top)] bg-bg-elevated/90" /> : null}
          {/* A docked sheet's handle: it can be pulled down to close (useSheetDrag). */}
          {docked ? (
            <div ref={grabberRef} aria-hidden className="flex shrink-0 justify-center pt-2 sm:hidden short:flex" data-testid="sheet-grabber">
              <span className="h-1 w-9 rounded-full bg-border-strong" />
            </div>
          ) : null}
          {header ? (
            <div ref={headerRef} className={cn("relative shrink-0 border-b border-border", headerClassName)} data-testid={headerTestId}>
              {header}
              <span
                ref={controlsRef}
                data-testid="modal-controls"
                className={cn(
                  "flex items-center gap-1",
                  flow && !docked
                    ? "fixed right-[max(0.5rem,env(safe-area-inset-right))] top-[calc(env(safe-area-inset-top)+0.5rem)] z-20 rounded-lg bg-bg-elevated/85 shadow-lg backdrop-blur"
                    : screen
                      ? // Centred in the account screen's 52px bar at every width it opens at.
                        "absolute right-2 top-2"
                      : innerScroll || pinned || docked
                        ? "absolute right-2 top-2 sm:right-3 sm:top-3"
                        : "absolute right-2 top-2 sm:right-3 sm:top-3 short:fixed short:right-[max(0.5rem,env(safe-area-inset-right))] short:top-2 short:z-20 short:rounded-lg short:bg-bg-elevated/85 short:shadow-lg short:backdrop-blur",
                )}
              >
                {controls}
              </span>
            </div>
          ) : (
            <div ref={headerRef} className={cn("flex shrink-0 items-start justify-between gap-3 border-b border-border bg-bg-elevated px-4 py-3 sm:px-5 sm:py-4", !(docked && flow) && "short:sticky short:top-0 short:z-10", headerClassName)} data-testid={headerTestId}>
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
          <div
            ref={bodyRef}
            className={cn(
              innerScroll
                ? "flex min-h-0 flex-auto flex-col overflow-hidden"
                : [
                    "px-4 sm:px-6",
                    // The last line keeps clear of the bottom edge, and of the home indicator where
                    // there is one (pb-safe-N: N steps, or the inset where larger; pb-safe alone was
                    // 0 px in a browser, with the text on the edge). With a footer, the footer keeps
                    // that clearance instead. A safe padding is the only one for its edge
                    // (globals.css), so the top is padded on its own beside it.
                    footer ? "py-4 sm:py-5" : "pt-4 pb-safe-4 sm:pt-5 sm:pb-safe-5",
                    flow ? "flex-none" : pinned || docked || screen ? BODY_SCROLLS : `${BODY_SCROLLS} short:flex-none short:overflow-y-visible`,
                  ],
              bodyClassName,
            )}
            data-testid={bodyTestId}
            data-sheet-scroll={(docked || screen) && !flow ? "" : undefined}
          >
            <SettledContext.Provider value={settled}>{children}</SettledContext.Provider>
          </div>
          {/* The footer's actions keep clear of the bottom edge: 1rem where a sheet is docked to it
              (phones and short windows), as a body's last line does, 0.75rem in a centred window and
              in the other windows, or the home indicator's inset where it is larger. */}
          {footer ? <div ref={footerRef} className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-bg-elevated px-4 pt-3 sm:px-6", docked ? "pb-safe-4 sm:pb-safe-3 short:pb-safe-4" : "pb-safe-3", !innerScroll && !pinned && !(docked && flow) && "short:sticky short:bottom-0 short:z-10 short:mt-auto", flow && !docked && "sticky bottom-0 z-10 mt-auto")}>{footer}</div> : null}
        </CloseContext.Provider>
      ) : null}
    </dialog>
  );
}
