"use client";

import * as React from "react";
import { INSTALL_CHANGE } from "./capture-script";

/*
  What the browser says about installing the app, read the same way on every page:
  - the install offer Chromium browsers make (`beforeinstallprompt`), kept so the Install button
    can show the browser's own install dialog when the person asks for it;
  - `appinstalled`, when the app was installed from this tab (by our button or the browser's own
    address-bar install);
  - whether this page is already running as the installed app (the display mode).
  The two events are caught by a tiny script at the top of every page (capture-script.ts, inlined
  by the root layout), because the browser can make its offer before the app's code has loaded.
  Nothing is stored: a page in another browser, or after the app was uninstalled, never assumes
  it is installed.
*/

/** The install offer Chromium browsers fire (not in TypeScript's DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent | null;
    __appInstalled?: boolean;
  }
  interface Navigator {
    /** Safari on iPhone and iPad: true when opened from the Home Screen. */
    standalone?: boolean;
  }
}

/** Running as the installed app: any of the display modes an install opens in, or iOS's flag. */
export const STANDALONE_QUERY = "(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)";

export interface InstallState {
  /** False on the server and in the first render, before the browser has been asked. */
  ready: boolean;
  /** This page is the installed app. */
  standalone: boolean;
  /** Installed from this tab, just now. */
  installed: boolean;
  /** The browser's own install dialog can be shown. */
  canPrompt: boolean;
}

const SERVER: InstallState = { ready: false, standalone: false, installed: false, canPrompt: false };
let snapshot: InstallState = SERVER;

function read(): InstallState {
  const standalone = window.matchMedia(STANDALONE_QUERY).matches || navigator.standalone === true;
  const installed = !!window.__appInstalled;
  const canPrompt = !!window.__installPrompt;
  if (snapshot.ready && snapshot.standalone === standalone && snapshot.installed === installed && snapshot.canPrompt === canPrompt) return snapshot;
  return (snapshot = { ready: true, standalone, installed, canPrompt });
}

function subscribe(onChange: () => void) {
  const mode = window.matchMedia(STANDALONE_QUERY);
  window.addEventListener(INSTALL_CHANGE, onChange);
  mode.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(INSTALL_CHANGE, onChange);
    mode.removeEventListener("change", onChange);
  };
}

export function useInstallState(): InstallState {
  return React.useSyncExternalStore(subscribe, read, () => SERVER);
}

/**
 * Shows the browser's own install dialog, from the person's click. The offer can be used once:
 * after it the browser makes a new one on a later page load if the app is still not installed.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const offer = window.__installPrompt;
  if (!offer) return "unavailable";
  window.__installPrompt = null;
  window.dispatchEvent(new Event(INSTALL_CHANGE));
  try {
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    if (outcome === "accepted") {
      window.__appInstalled = true;
      window.dispatchEvent(new Event(INSTALL_CHANGE));
    }
    return outcome;
  } catch {
    return "unavailable";
  }
}
