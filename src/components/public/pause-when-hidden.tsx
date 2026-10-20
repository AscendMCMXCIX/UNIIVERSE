"use client";

import * as React from "react";

/**
 * Marks an element `data-offscreen` while it is out of view, so its decorative motion (the public
 * hero's drifting light) pauses instead of running unseen. One observer, no state, no re-render.
 */
export function PauseWhenHidden({ targetId }: { targetId: string }) {
  React.useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) el.toggleAttribute("data-offscreen", !entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [targetId]);
  return null;
}
