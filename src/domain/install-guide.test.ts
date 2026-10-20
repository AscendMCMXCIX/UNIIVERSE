import { describe, expect, it } from "vitest";
import { installGuideFor } from "./install-guide";

const UA = {
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0",
  macSafari17: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  macSafari16: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chromebook: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  linuxOpera: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
  androidEdge: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.3537.70",
  androidWebView: "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36",
  iphoneSafari17: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iOS 26: the OS token stays at 18_6; Safari's own version says 26.
  iphoneSafari26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneChrome17: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  iphoneChrome163: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/112.0.5615.46 Mobile/15E148 Safari/604.1",
  iphoneChromeFrozen: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.7390.41 Mobile/15E148 Safari/604.1",
  iphoneFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
  iphoneEdge: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/141.0.3537.70 Mobile/15E148 Safari/605.1.15",
  ipadMobile: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.30.97 (iPhone15,2; iOS 17_5; en_GB; en; scale=3.00; 1179x2556)",
  androidFacebook: "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.109;]",
};

describe("installGuideFor", () => {
  it("computers with Chromium get the address-bar and menu install, per browser and system", () => {
    expect(installGuideFor(UA.winChrome)).toEqual({ kind: "desktop", browser: "chrome", os: "windows" });
    expect(installGuideFor(UA.winEdge)).toEqual({ kind: "desktop", browser: "edge", os: "windows" });
    expect(installGuideFor(UA.macChrome)).toEqual({ kind: "desktop", browser: "chrome", os: "mac" });
    expect(installGuideFor(UA.chromebook)).toEqual({ kind: "desktop", browser: "chrome", os: "chromeos" });
    expect(installGuideFor(UA.linuxOpera)).toEqual({ kind: "desktop", browser: "opera", os: "linux" });
  });

  it("Firefox on a computer has no install; Safari on a Mac adds to the Dock from Safari 17", () => {
    expect(installGuideFor(UA.winFirefox)).toEqual({ kind: "firefox-desktop" });
    expect(installGuideFor(UA.macSafari17)).toEqual({ kind: "mac-safari", canAdd: true });
    expect(installGuideFor(UA.macSafari16)).toEqual({ kind: "mac-safari", canAdd: false });
  });

  it("Android browsers are told apart (Samsung Internet and Edge also say Chrome)", () => {
    expect(installGuideFor(UA.androidChrome)).toEqual({ kind: "android", browser: "chrome" });
    expect(installGuideFor(UA.androidSamsung)).toEqual({ kind: "android", browser: "samsung" });
    expect(installGuideFor(UA.androidFirefox)).toEqual({ kind: "android", browser: "firefox" });
    expect(installGuideFor(UA.androidEdge)).toEqual({ kind: "android", browser: "edge" });
  });

  it("iPhone Safari: Add to Home Screen, with Open as Web App from iOS 26 (read from Safari's own version)", () => {
    expect(installGuideFor(UA.iphoneSafari17)).toEqual({ kind: "ios", device: "iphone", browser: "safari", canAdd: true, webAppSwitch: "no" });
    expect(installGuideFor(UA.iphoneSafari26)).toEqual({ kind: "ios", device: "iphone", browser: "safari", canAdd: true, webAppSwitch: "yes" });
  });

  it("other iPhone browsers can add from iOS 16.4; their frozen OS token leaves the switch a maybe", () => {
    expect(installGuideFor(UA.iphoneChrome17)).toMatchObject({ kind: "ios", browser: "chrome", canAdd: true, webAppSwitch: "no" });
    expect(installGuideFor(UA.iphoneChrome163)).toMatchObject({ kind: "ios", browser: "chrome", canAdd: false });
    expect(installGuideFor(UA.iphoneChromeFrozen)).toMatchObject({ kind: "ios", browser: "chrome", canAdd: true, webAppSwitch: "maybe" });
    expect(installGuideFor(UA.iphoneFirefox)).toMatchObject({ kind: "ios", browser: "firefox", canAdd: true });
    expect(installGuideFor(UA.iphoneEdge)).toMatchObject({ kind: "ios", browser: "edge", canAdd: true });
  });

  it("an iPad is an iPad, also when Safari presents it as a Mac (it has a touch screen; a Mac does not)", () => {
    expect(installGuideFor(UA.ipadMobile)).toMatchObject({ kind: "ios", device: "ipad", browser: "safari" });
    expect(installGuideFor(UA.macSafari17, { maxTouchPoints: 5 })).toMatchObject({ kind: "ios", device: "ipad", browser: "safari", canAdd: true });
    expect(installGuideFor(UA.macSafari17, { maxTouchPoints: 0 })).toEqual({ kind: "mac-safari", canAdd: true });
  });

  it("browsers inside other apps cannot install: say which app when it says so", () => {
    expect(installGuideFor(UA.iphoneInstagram)).toEqual({ kind: "in-app", app: "Instagram", os: "ios" });
    expect(installGuideFor(UA.androidFacebook)).toEqual({ kind: "in-app", app: "Facebook", os: "android" });
    expect(installGuideFor(UA.androidWebView)).toEqual({ kind: "in-app", app: null, os: "android" });
  });

  it("anything else gets general advice, never a guess", () => {
    expect(installGuideFor("")).toEqual({ kind: "unknown" });
    expect(installGuideFor("curl/8.4.0")).toEqual({ kind: "unknown" });
  });
});
