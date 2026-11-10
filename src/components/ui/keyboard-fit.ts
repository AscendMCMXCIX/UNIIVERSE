"use client";

import * as React from "react";
import { screenHeight } from "@/lib/screen";

/** What raises the on-screen keyboard: a field typed in. */
const TYPED = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]):not([type=file]):not([type=color]), textarea, [contenteditable]:not([contenteditable=false])";

/**
 * Touch screens: while the on-screen keyboard is up, the window around `ref` (its <dialog>) fits the
 * part of the screen above the keyboard, so the field being typed in and the window's buttons stay
 * in view instead of behind it. Phones leave the page's layout as it is when the keyboard opens
 * (iOS Safari always, Chrome on Android by default) and only shrink the visual viewport, so a
 * window sized to the screen would otherwise keep its full height under the keyboard.
 *
 * The window keeps its own size and place within the visible part: a window that fills the screen
 * fills that part, a smaller one stays centred in it, and either scrolls inside when it is taller.
 * Returns whether the keyboard is up.
 *
 * The keyboard counts as up once a field in the window is typed in (and until the visible part is the
 * whole screen again), and only when the visible part is a keyboard's worth shorter than the screen
 * yet still a fair share of it (at least 30%: a keyboard never leaves less). A shrunken visual
 * viewport alone is not believed: iOS has reported one a keyboard's height short in installed apps
 * with nothing focused, even into the next page (WebKit bug 323322), and a window fitted to that
 * would have been squeezed for nothing. The screen is measured as fixed positioning sees it
 * (lib/screen.ts), the box the window is placed in.
 */
export function useKeyboardFit(ref: React.RefObject<HTMLElement | null>): boolean {
  const [up, setUp] = React.useState(false);
  React.useEffect(() => {
    const vv = window.visualViewport;
    const dialog = ref.current?.closest("dialog");
    if (!vv || !dialog) return;
    const touch = window.matchMedia("(pointer: coarse)");
    const reset = () => {
      for (const p of ["top", "bottom", "max-height"]) dialog.style.removeProperty(p);
    };
    let frame = 0;
    // Up since a field was typed in, until the visible part is the whole screen again: focus leaving
    // the field for a moment (Sign in disabled while it signs in) does not put the keyboard away.
    let wasUp = false;
    const apply = () => {
      frame = 0;
      const screen = screenHeight();
      const active = document.activeElement;
      const typing = active instanceof HTMLElement && dialog.contains(active) && active.matches(TYPED);
      // A keyboard takes a good share of the screen but never nearly all of it; pinch zoom also
      // shrinks the visual viewport, but scaled.
      const shrunk = touch.matches && vv.scale < 1.05 && screen - vv.height > 120 && vv.height >= screen * 0.3;
      const keyboard = shrunk && (typing || wasUp);
      wasUp = keyboard;
      if (keyboard) {
        // A modal dialog is fixed with `inset: 0` and `margin: auto`: these insets make the visible
        // part its area, and the height limit keeps it inside.
        dialog.style.top = `${Math.round(vv.offsetTop)}px`;
        dialog.style.bottom = `${Math.max(0, Math.round(screen - vv.offsetTop - vv.height))}px`;
        dialog.style.maxHeight = `${Math.round(vv.height)}px`;
        if (typing) requestAnimationFrame(() => active.scrollIntoView({ block: "nearest" }));
      } else reset();
      setUp(keyboard);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    // A field taking or losing the focus raises or puts away the keyboard.
    dialog.addEventListener("focusin", schedule);
    dialog.addEventListener("focusout", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      dialog.removeEventListener("focusin", schedule);
      dialog.removeEventListener("focusout", schedule);
      reset();
    };
  }, [ref]);
  return up;
}
