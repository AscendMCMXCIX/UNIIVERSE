/*
  Taps on the frame's script-driven controls before the page's code has run. The avatar (the
  phone's account sheet), the tablet's menu and the desktop sidebar's collapse control are buttons
  with a React click handler only. On a slow network the page is drawn, and those buttons can be
  pressed, seconds before that handler exists: a tap then did nothing, and one while React was
  starting waited for it (0.3 to 0.9 s after the tap at CPU x4 on a local server).

  The root layout inlines EARLY_TAPS_SCRIPT at the top of <head>, beside the capture scripts
  (capture-script.ts, image-errors.ts). Until the frame is ready it listens for clicks on window,
  in the capture phase, before anything else hears them: a tap, a mouse click, and Enter or Space
  on the focused button alike. A click on a [data-early] control is kept:
    - stopped, so React never replays it as well;
    - queued once, however often the control is tapped;
    - marked aria-busy, which globals.css draws as the control pressed.
  MobileNav and CollapsibleSidebar release the taps for their controls in their first effect
  (releaseEarlyTaps): the script is told the page is ready, and each control kept is clicked once
  more, so its own handler does what the tap asked for, exactly as for a tap made later. From then
  on the script does nothing. A plain module, not a client one, so the server layout gets the
  script itself.
*/

/** What a frame control opens: its data-early value. */
export type EarlyTap = "sheet" | "drawer" | "sidebar";

declare global {
  interface Window {
    /** Set once the frame's code runs: the early-tap script stands aside. */
    __frameReady?: boolean;
    /** The controls tapped before then, each once, in the order they were tapped. */
    __earlyTaps?: string[];
  }
}

export const EARLY_TAPS_SCRIPT = `(function(){var w=window,q=w.__earlyTaps=[];function h(e){if(w.__frameReady){w.removeEventListener("click",h,true);return}var t=e.target,c=t&&t.closest?t.closest("[data-early]"):null;if(!c)return;e.preventDefault();e.stopImmediatePropagation();var k=c.getAttribute("data-early");if(q.indexOf(k)<0){q.push(k);c.setAttribute("aria-busy","true")}}w.addEventListener("click",h,true)})();`;

/**
 * The frame's code runs: the early-tap script stands aside from now on, and each of these controls
 * that was tapped before is clicked once more (once however often it was tapped, in the order the
 * taps were made), its pressed look cleared, so its own handler opens what was asked for. Called in
 * the owning component's first effect, once its handlers are attached; a second call finds nothing
 * left to release.
 */
export function releaseEarlyTaps(...kinds: EarlyTap[]): void {
  window.__frameReady = true;
  const queue = window.__earlyTaps ?? [];
  const released: EarlyTap[] = [];
  for (let i = 0; i < queue.length; ) {
    const kind = queue[i] as EarlyTap;
    if (kinds.includes(kind)) {
      released.push(kind);
      queue.splice(i, 1);
    } else i++;
  }
  for (const kind of kinds) for (const el of document.querySelectorAll(`[data-early="${kind}"][aria-busy]`)) el.removeAttribute("aria-busy");
  for (const kind of released) document.querySelector<HTMLElement>(`[data-early="${kind}"]`)?.click();
}
