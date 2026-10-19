"use client";

import * as React from "react";

/**
 * Registers the service worker (public/sw.js) in production builds: it only shows an offline page
 * when a page cannot load, and caches nothing else. Registration waits for the page to finish
 * loading so it never competes with the first render.
 */
export function ServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
