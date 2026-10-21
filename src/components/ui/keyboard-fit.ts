"use client";

import * as React from "react";

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
    const apply = () => {
      frame = 0;
      // A keyboard takes a good share of the screen; pinch zoom also shrinks the visual viewport, but scaled.
      const keyboard = touch.matches && vv.scale < 1.05 && window.innerHeight - vv.height > 120;
      if (keyboard) {
        // A modal dialog is fixed with `inset: 0` and `margin: auto`: these insets make the visible
        // part its area, and the height limit keeps it inside.
        dialog.style.top = `${Math.round(vv.offsetTop)}px`;
        dialog.style.bottom = `${Math.max(0, Math.round(window.innerHeight - vv.offsetTop - vv.height))}px`;
        dialog.style.maxHeight = `${Math.round(vv.height)}px`;
        const active = document.activeElement;
        if (active instanceof HTMLElement && dialog.contains(active)) requestAnimationFrame(() => active.scrollIntoView({ block: "nearest" }));
      } else reset();
      setUp(keyboard);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      reset();
    };
  }, [ref]);
  return up;
}
