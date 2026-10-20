/*
  How this browser can install the app (the web app manifest and service worker in
  src/app/manifest.ts and public/sw.js), worked out from its user agent and a few capabilities.
  It decides only which instructions to show: whether the browser can install right now is known
  from its own `beforeinstallprompt` offer (Chromium on Windows, Android, macOS, Linux and
  ChromeOS), which the install window prefers whenever it has one (see install-app.tsx).

  Browser limits this follows (as of late 2026):
  - iPhone and iPad: no browser can install from a page; people use Share → Add to Home Screen.
    Safari always could; Chrome, Edge and Firefox can since iOS 16.4. From iOS 26 the sheet has
    an "Open as Web App" switch, on by default. Safari's version is its "Version/" token: the
    "OS" token is frozen at 18_6 from iOS 26 on.
  - In-app browsers (Instagram, Facebook, TikTok…) cannot install; the page must be opened in a
    real browser first.
  - Firefox on a computer has no install for web apps; Safari on a Mac can add one to the Dock
    from Safari 17 (macOS Sonoma).
*/

export type InstallBrowser = "safari" | "chrome" | "edge" | "firefox" | "samsung" | "opera" | "other";

export type InstallGuide =
  /** iPhone or iPad. `canAdd`: this browser has Add to Home Screen; `webAppSwitch`: whether the sheet shows Open as Web App. */
  | { kind: "ios"; device: "iphone" | "ipad"; browser: InstallBrowser; canAdd: boolean; webAppSwitch: "yes" | "no" | "maybe" }
  /** Android without the browser's own install offer (not offered yet, dismissed, or not supported). */
  | { kind: "android"; browser: InstallBrowser }
  /** A computer with a Chromium browser (Chrome, Edge, Brave, Opera…) and no install offer at hand. */
  | { kind: "desktop"; browser: InstallBrowser; os: "windows" | "mac" | "linux" | "chromeos" | "other" }
  /** Safari on a Mac: File → Add to Dock from Safari 17. */
  | { kind: "mac-safari"; canAdd: boolean }
  /** Firefox on a computer: no install for web apps. */
  | { kind: "firefox-desktop" }
  /** A browser built into another app, which cannot install. */
  | { kind: "in-app"; app: string | null; os: "ios" | "android" | "other" }
  | { kind: "unknown" };

/** The apps whose built-in browsers announce themselves, and how they do. */
const IN_APP: Array<[RegExp, string]> = [
  [/Instagram/, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/, "Snapchat"],
  [/LinkedInApp/, "LinkedIn"],
  [/Line\//, "LINE"],
  [/MicroMessenger/, "WeChat"],
  [/Twitter for|XApp/, "X"],
];

const num = (v: string | undefined) => (v === undefined ? null : Number(v));

/**
 * Which instructions fit this browser. `maxTouchPoints` tells an iPad (which, in Safari's
 * default desktop mode, introduces itself as a Mac) from a Mac.
 */
export function installGuideFor(userAgent: string, options: { maxTouchPoints?: number } = {}): InstallGuide {
  const ua = userAgent || "";
  const touch = (options.maxTouchPoints ?? 0) > 1;
  const iphone = /iPhone|iPod/.test(ua);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && touch);
  const ios = iphone || ipad;
  const android = /Android/.test(ua);
  const os: "ios" | "android" | "other" = ios ? "ios" : android ? "android" : "other";

  const inApp = IN_APP.find(([re]) => re.test(ua));
  // Android's WebView (inside an app) says "; wv)"; iOS app views lack Safari's own token.
  if (inApp) return { kind: "in-app", app: inApp[1], os };
  if (android && /; wv\)/.test(ua)) return { kind: "in-app", app: null, os };

  const browser: InstallBrowser = /EdgiOS|EdgA|Edg\//.test(ua)
    ? "edge"
    : /FxiOS|Firefox\//.test(ua)
      ? "firefox"
      : /SamsungBrowser/.test(ua)
        ? "samsung"
        : /OPiOS|OPR\/|OPT\//.test(ua)
          ? "opera"
          : /CriOS|Chrome\/|Chromium\//.test(ua)
            ? "chrome"
            : /Safari\//.test(ua) && /Version\//.test(ua)
              ? "safari"
              : "other";

  if (ios) {
    const safariVersion = num(/Version\/(\d+)/.exec(ua)?.[1]);
    const osMatch = /OS (\d+)_(\d+)/.exec(ua);
    const osMajor = num(osMatch?.[1]);
    const osMinor = num(osMatch?.[2]) ?? 0;
    // Safari's own version tracks iOS; other browsers only have the OS token, frozen from iOS 26.
    const major = browser === "safari" ? safariVersion ?? osMajor : osMajor;
    const canAdd = browser === "safari" || major === null || major > 16 || (major === 16 && osMinor >= 4);
    const webAppSwitch = browser === "safari" ? (safariVersion === null ? "maybe" : safariVersion >= 26 ? "yes" : "no") : osMajor !== null && osMajor >= 26 ? "yes" : osMajor !== null && osMajor >= 18 ? "maybe" : "no";
    return { kind: "ios", device: ipad ? "ipad" : "iphone", browser, canAdd, webAppSwitch };
  }
  if (android) return { kind: "android", browser };
  if (browser === "firefox") return { kind: "firefox-desktop" };
  if (browser === "safari" && /Macintosh/.test(ua)) {
    const version = num(/Version\/(\d+)/.exec(ua)?.[1]);
    return { kind: "mac-safari", canAdd: version !== null && version >= 17 };
  }
  if (browser === "chrome" || browser === "edge" || browser === "opera") {
    const desktopOs = /Windows/.test(ua) ? "windows" : /CrOS/.test(ua) ? "chromeos" : /Macintosh/.test(ua) ? "mac" : /Linux/.test(ua) ? "linux" : "other";
    return { kind: "desktop", browser, os: desktopOs };
  }
  return { kind: "unknown" };
}
