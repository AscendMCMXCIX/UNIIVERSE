/*
  ios-sim page agent (draft). The driver's local proxy injects it into every HTML page of the demo
  build it serves on the runner (never production, never committed to the app): it measures the
  page and the account menu where they are drawn, and takes a few commands from the driver over
  same-origin HTTP (/__agent/poll, /__agent/report), so it works the same in Mobile Safari and in a
  Home Screen web app, where no WebDriver can reach. Taps are NOT made here: the driver taps the
  simulator's screen (AXe), like a finger; this script only reports what the page saw.

  It records numbers, rectangles, test ids, link paths and CSS values only: no text content (the
  account header holds a name). It can also be evaluated through WebDriver's Execute Script, which
  wraps it in a function (no polling then: window.__SIM_AGENT_CONFIG__.poll is false or unset).
*/
(function () {
  "use strict";
  if (window.__simAgent) return;
  var CFG = window.__SIM_AGENT_CONFIG__ || {};
  var SEL = {
    button: "[data-testid=account-sheet-button]",
    menu: "[data-testid=account-sheet]",
    close: "[data-testid=account-sheet-close]",
    controls: "a[href], button, input, select, textarea, summary, [role=button], [role=switch], [role=link], [role=menuitem], [role=tab]",
    tabbar: "[data-testid=phone-tabbar]",
    topbar: "[data-testid=mobile-topbar]",
  };
  var userSel = CFG.selectors || {};
  for (var key in userSel) if (Object.prototype.hasOwnProperty.call(userSel, key) && userSel[key]) SEL[key] = userSel[key];
  var BASE = CFG.base || "/__agent";
  var pageId = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  var startedAt = Date.now();
  var errorsSent = 0;

  function r1(n) {
    return typeof n === "number" && isFinite(n) ? Math.round(n * 10) / 10 : n;
  }
  function box(el) {
    if (!el || !el.getBoundingClientRect) return null;
    var r = el.getBoundingClientRect();
    return { x: r1(r.left), y: r1(r.top), w: r1(r.width), h: r1(r.height), bottom: r1(r.bottom), right: r1(r.right) };
  }
  function pick(el, names) {
    var out = {};
    if (!el) return out;
    var cs = getComputedStyle(el);
    for (var i = 0; i < names.length; i++) out[names[i]] = cs.getPropertyValue(names[i]);
    return out;
  }
  function testid(el) {
    return el && el.getAttribute ? el.getAttribute("data-testid") : null;
  }
  function standaloneFlags() {
    var mm = function (q) {
      try {
        return matchMedia(q).matches;
      } catch (e) {
        return null;
      }
    };
    return {
      navigatorStandalone: typeof navigator.standalone === "boolean" ? navigator.standalone : null,
      displayModeStandalone: mm("(display-mode: standalone)"),
      displayModeBrowser: mm("(display-mode: browser)"),
      pointerCoarse: mm("(pointer: coarse)"),
      hoverNone: mm("(hover: none)"),
      reducedMotion: mm("(prefers-reduced-motion: reduce)"),
    };
  }
  function isStandalone() {
    var f = standaloneFlags();
    return f.navigatorStandalone === true || f.displayModeStandalone === true;
  }

  /** A hidden fixed element sized by `css`: how tall a CSS length is here, and what env() gives. */
  function probe(css) {
    var d = document.createElement("div");
    d.setAttribute("aria-hidden", "true");
    d.style.cssText = "position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;box-sizing:content-box;" + css;
    (document.body || document.documentElement).appendChild(d);
    var r = d.getBoundingClientRect();
    var cs = getComputedStyle(d);
    var out = {
      h: r1(r.height),
      top: r1(r.top),
      padTop: r1(parseFloat(cs.paddingTop) || 0),
      padRight: r1(parseFloat(cs.paddingRight) || 0),
      padBottom: r1(parseFloat(cs.paddingBottom) || 0),
      padLeft: r1(parseFloat(cs.paddingLeft) || 0),
    };
    d.remove();
    return out;
  }
  function units() {
    var safe = probe("height:0;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)");
    return {
      svh: probe("height:100svh").h,
      dvh: probe("height:100dvh").h,
      lvh: probe("height:100lvh").h,
      vh: probe("height:100vh").h,
      // The fixed containing block (top:0 to bottom:0): what a fixed or modal box is placed in.
      fixedBlock: probe("bottom:0;height:auto").h,
      safe: { top: safe.padTop, right: safe.padRight, bottom: safe.padBottom, left: safe.padLeft },
      fitContent: typeof CSS !== "undefined" && CSS.supports ? CSS.supports("height", "fit-content") : null,
    };
  }
  function viewport() {
    var de = document.documentElement;
    var vv = window.visualViewport;
    var room = {
      top: vv ? Math.max(0, vv.offsetTop) : 0,
      bottom: Math.min(window.innerHeight, de.clientHeight || Infinity, vv ? vv.offsetTop + vv.height : Infinity),
    };
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      clientWidth: de.clientWidth,
      clientHeight: de.clientHeight,
      bodyClientHeight: document.body ? document.body.clientHeight : null,
      scrollX: r1(window.scrollX),
      scrollY: r1(window.scrollY),
      scrollHeight: (document.scrollingElement || de).scrollHeight,
      dpr: window.devicePixelRatio,
      screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight },
      orientation: screen.orientation ? screen.orientation.type : typeof window.orientation === "number" ? window.orientation : null,
      vv: vv ? { width: r1(vv.width), height: r1(vv.height), offsetTop: r1(vv.offsetTop), offsetLeft: r1(vv.offsetLeft), pageTop: r1(vv.pageTop), pageLeft: r1(vv.pageLeft), scale: vv.scale } : null,
      // What DetailModal's usePanelRoom (PR #278) computes right now, to compare with what it stored.
      panelRoom: { top: r1(room.top), bottom: r1(room.bottom), span: r1(room.bottom - room.top) },
      html: { rect: box(de), style: pick(de, ["overflow", "overflow-y", "overscroll-behavior", "height"]) },
      body: { rect: box(document.body), style: pick(document.body, ["overflow", "height", "min-height", "padding-right"]) },
    };
  }
  function visibleArea() {
    var vv = window.visualViewport;
    return vv ? { top: vv.offsetTop, bottom: vv.offsetTop + vv.height, left: vv.offsetLeft, right: vv.offsetLeft + vv.width } : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  }
  function shown(el) {
    if (!el) return false;
    if (el.tagName === "DIALOG") return el.open;
    var r = el.getBoundingClientRect();
    var cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  }
  /** Every control in `root`: on screen (inside what is visible), what a tap at its middle reaches, its size. */
  function controls(root) {
    var area = visibleArea();
    var list = [];
    var els = root.querySelectorAll(SEL.controls);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      if (!(r.width > 0 && r.height > 0) || cs.visibility === "hidden" || cs.display === "none") continue;
      var cx = r.left + r.width / 2;
      var cy = r.top + r.height / 2;
      var at = document.elementFromPoint(cx, cy);
      list.push({
        i: list.length,
        tag: el.tagName.toLowerCase(),
        testid: testid(el),
        href: el.getAttribute("href"),
        role: el.getAttribute("role"),
        current: el.getAttribute("aria-current"),
        rect: box(el),
        visible: r.top >= area.top - 0.5 && r.bottom <= area.bottom + 0.5 && r.left >= area.left - 0.5 && r.right <= area.right + 0.5,
        hit: !!at && (at === el || el.contains(at)),
        target44: r.width >= 44 && r.height >= 44,
      });
    }
    return list;
  }
  /** Elements in `root` (itself included) that scroll: more than one is nested scrolling. */
  function scrollables(root) {
    var out = [];
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.scrollHeight <= el.clientHeight + 1) continue;
      var oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      out.push({ tag: el.tagName.toLowerCase(), testid: testid(el), rect: box(el), clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollTop: r1(el.scrollTop), overflowY: oy });
    }
    return out;
  }
  function windowInfo(d) {
    if (!d) return null;
    var kids = [];
    for (var i = 0; i < d.children.length; i++) {
      var c = d.children[i];
      kids.push({
        i: i,
        tag: c.tagName.toLowerCase(),
        testid: testid(c),
        rect: box(c),
        clientHeight: c.clientHeight,
        scrollHeight: c.scrollHeight,
        scrollTop: r1(c.scrollTop),
        style: pick(c, ["flex-grow", "flex-shrink", "flex-basis", "min-height", "height", "max-height", "overflow-y", "position"]),
      });
    }
    var anims = [];
    try {
      var a = d.getAnimations ? d.getAnimations() : [];
      for (var j = 0; j < a.length; j++) anims.push({ name: a[j].animationName || a[j].id || "", state: a[j].playState, time: r1(a[j].currentTime) });
    } catch (e) {
      // getAnimations is optional here
    }
    var area = visibleArea();
    var r = d.getBoundingClientRect();
    return {
      tag: d.tagName.toLowerCase(),
      testid: testid(d),
      open: d.tagName === "DIALOG" ? d.open : null,
      shown: shown(d),
      data: { size: d.getAttribute("data-size"), entered: d.getAttribute("data-entered"), flow: d.getAttribute("data-flow"), closing: d.getAttribute("data-closing") },
      rect: box(d),
      insideVisible: r.top >= area.top - 0.5 && r.bottom <= area.bottom + 0.5,
      clientHeight: d.clientHeight,
      scrollHeight: d.scrollHeight,
      scrollTop: r1(d.scrollTop),
      vars: { vvTop: d.style.getPropertyValue("--vv-top"), vvBottom: d.style.getPropertyValue("--vv-bottom") },
      style: pick(d, ["position", "top", "bottom", "left", "right", "height", "max-height", "min-height", "width", "display", "flex-direction", "overflow-y", "margin-top", "margin-bottom", "transform", "opacity", "animation-name", "padding-top", "padding-bottom", "box-sizing"]),
      animations: anims,
      children: kids,
      scrollables: scrollables(d),
      controls: controls(d),
      close: box(d.querySelector(SEL.close) || d.querySelector("[aria-label=Close]")),
    };
  }
  function focusInfo() {
    var a = document.activeElement;
    if (!a || a === document.body) return { tag: a ? a.tagName.toLowerCase() : null };
    var fv = null;
    try {
      fv = a.matches(":focus-visible");
    } catch (e) {
      // older engines
    }
    return { tag: a.tagName.toLowerCase(), testid: testid(a), ariaLabelIsClose: a.getAttribute("aria-label") === "Close", focusVisible: fv, outline: pick(a, ["outline-width", "outline-style", "outline-color", "outline-offset"]), rect: box(a) };
  }
  function menuEl() {
    return document.querySelector(SEL.menu);
  }
  /** The windows on screen other than the menu (dialogs, and anything with role=dialog that is drawn). */
  function otherWindows() {
    var out = [];
    var m = menuEl();
    var ds = document.querySelectorAll("dialog[open], [role=dialog]");
    for (var i = 0; i < ds.length; i++) if (ds[i] !== m && shown(ds[i])) out.push(ds[i]);
    return out;
  }
  function openDialogs() {
    return otherWindows().map(windowInfo);
  }
  function measure(label) {
    var m = menuEl();
    return {
      label: label || "",
      page: pageId,
      path: location.pathname + location.search,
      at: Date.now(),
      sinceLoadMs: Date.now() - startedAt,
      readyState: document.readyState,
      flags: standaloneFlags(),
      ua: navigator.userAgent,
      viewport: viewport(),
      units: units(),
      button: box(document.querySelector(SEL.button)),
      topbar: box(document.querySelector(SEL.topbar)),
      tabbar: box(document.querySelector(SEL.tabbar)),
      menu: m && shown(m) ? windowInfo(m) : m ? { present: true, shown: false } : null,
      dialogs: openDialogs(),
      focus: focusInfo(),
    };
  }
  function info() {
    var meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    var man = document.querySelector('link[rel="manifest"]');
    var b = document.querySelector(SEL.button);
    return {
      page: pageId,
      path: location.pathname + location.search,
      readyState: document.readyState,
      standalone: isStandalone(),
      flags: standaloneFlags(),
      appTitle: meta ? meta.getAttribute("content") : null,
      manifest: man ? man.getAttribute("href") : null,
      hasButton: !!b,
      button: box(b),
      screen: { width: screen.width, height: screen.height },
      inner: { width: window.innerWidth, height: window.innerHeight },
    };
  }

  // ---- reporting -------------------------------------------------------------------------------
  function post(type, data, id) {
    if (!CFG.poll) return;
    try {
      var body = JSON.stringify({ page: pageId, type: type, data: data, id: id, at: Date.now() });
      fetch(BASE + "/report", { method: "POST", body: body, keepalive: body.length < 60000, headers: { "content-type": "application/json" }, cache: "no-store" }).catch(function () {});
    } catch (e) {
      // never let the agent break the page
    }
  }
  function safe(fn) {
    return function () {
      try {
        return fn.apply(this, arguments);
      } catch (e) {
        post("agent-error", { message: String(e && e.message ? e.message : e).slice(0, 300) });
      }
    };
  }

  // ---- what happens to the menu, on its own timeline (no driver round trip) -----------------------
  var menuWasShown = false;
  var dialogsWereShown = 0;
  function sampleFrames(label) {
    // The menu's place on each frame of its opening motion: a frame drawn off the screen shows here.
    var frames = [];
    var n = 0;
    var step = safe(function () {
      var m = menuEl();
      if (m && shown(m)) {
        var r = m.getBoundingClientRect();
        var cs = getComputedStyle(m);
        frames.push({ t: Date.now(), top: r1(r.top), h: r1(r.height), bottom: r1(r.bottom), opacity: cs.opacity, transform: cs.transform });
      }
      if (++n < 45) requestAnimationFrame(step);
      else post("menu-frames", { label: label, frames: frames });
    });
    requestAnimationFrame(step);
  }
  var check = safe(function () {
    var m = menuEl();
    var isShown = !!m && shown(m);
    if (isShown && !menuWasShown) {
      menuWasShown = true;
      post("menu-open", measure("menu-open+0"));
      sampleFrames("open");
      [250, 700, 1500].forEach(function (ms) {
        setTimeout(
          safe(function () {
            if (menuEl() && shown(menuEl())) post("menu-open+" + ms, measure("menu-open+" + ms));
          }),
          ms,
        );
      });
    } else if (!isShown && menuWasShown) {
      menuWasShown = false;
      post("menu-closed", measure("menu-closed"));
    }
    var count = otherWindows().length;
    if (count > dialogsWereShown) {
      setTimeout(
        safe(function () {
          post("dialog-open", measure("dialog-open+700"));
        }),
        700,
      );
    } else if (count < dialogsWereShown) post("dialog-closed", measure("dialog-closed"));
    dialogsWereShown = count;
  });

  // ---- one-shot capture of the next tap, for mapping screen points to page coordinates ------------
  var armed = null;
  function arm(ms) {
    disarm();
    var seen = [];
    var first = null;
    var swallow = function (e) {
      seen.push(e.type);
      if (!first && (e.type === "touchstart" || e.type === "pointerdown" || e.type === "mousedown")) {
        var p = e.touches && e.touches[0] ? e.touches[0] : e;
        first = { type: e.type, clientX: r1(p.clientX), clientY: r1(p.clientY), screenX: r1(p.screenX), screenY: r1(p.screenY), pointerType: e.pointerType || null };
        setTimeout(function () {
          post("calibration", { first: first, seen: seen.slice(0, 12), scrollY: r1(window.scrollY), vv: viewport().vv });
          disarm();
        }, 400);
      }
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    };
    var types = ["touchstart", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup", "click"];
    types.forEach(function (t) {
      window.addEventListener(t, swallow, { capture: true, passive: false });
    });
    armed = { types: types, fn: swallow, timer: setTimeout(disarm, ms || 5000) };
  }
  function disarm() {
    if (!armed) return;
    var a = armed;
    armed = null;
    clearTimeout(a.timer);
    a.types.forEach(function (t) {
      window.removeEventListener(t, a.fn, { capture: true });
    });
  }

  // ---- commands from the driver --------------------------------------------------------------------
  function rectOf(selector, index) {
    var els = document.querySelectorAll(selector);
    var el = null;
    if (typeof index === "number") el = els[index];
    // Otherwise the first one drawn (a selector can also match a copy hidden at this width).
    for (var i = 0; !el && i < els.length; i++) {
      var b = els[i].getBoundingClientRect();
      if (b.width > 0 && b.height > 0) el = els[i];
    }
    if (!el) return { found: els.length };
    var r = el.getBoundingClientRect();
    return { found: els.length, rect: box(el), center: { x: r1(r.left + r.width / 2), y: r1(r.top + r.height / 2) }, testid: testid(el), href: el.getAttribute("href") };
  }
  function handle(cmd) {
    var a = cmd.args || {};
    var out;
    switch (cmd.op) {
      case "info":
        out = info();
        break;
      case "measure":
        out = measure(a.label);
        break;
      case "navigate":
        setTimeout(function () {
          location.assign(a.url);
        }, 60);
        out = { navigating: a.url };
        break;
      case "scrollTo":
        window.scrollTo({ left: 0, top: a.y, behavior: "instant" });
        out = { scrollY: r1(window.scrollY) };
        break;
      case "scrollEnd":
        window.scrollTo({ left: 0, top: (document.scrollingElement || document.documentElement).scrollHeight, behavior: "instant" });
        out = { scrollY: r1(window.scrollY) };
        break;
      case "rect":
        out = rectOf(a.selector, a.index);
        break;
      case "menuControls":
        var m = menuEl();
        out = { controls: m && shown(m) ? controls(m) : [], vv: viewport().vv };
        break;
      case "click":
        var el = document.querySelector(a.selector);
        if (el) el.click();
        out = { clicked: !!el };
        break;
      case "blur":
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        out = { active: focusInfo() };
        break;
      case "arm":
        arm(a.ms);
        out = { armed: true };
        break;
      case "scrollInside":
        var s = document.querySelector(a.selector);
        if (s) s.scrollTop += a.dy || 0;
        out = { scrollTop: s ? r1(s.scrollTop) : null };
        break;
      default:
        out = { error: "unknown op " + cmd.op };
    }
    post("result", out, cmd.id);
  }
  var polls = 0;
  function poll() {
    var delay = document.visibilityState === "visible" ? 200 : 1000;
    var q = "?page=" + pageId + "&path=" + encodeURIComponent(location.pathname + location.search) + "&vis=" + document.visibilityState + "&sa=" + (isStandalone() ? 1 : 0) + "&rs=" + document.readyState + "&n=" + polls++;
    fetch(BASE + "/poll" + q, { cache: "no-store" })
      .then(function (r) {
        return r.status === 200 ? r.json() : null;
      })
      .then(function (cmd) {
        if (cmd) safe(handle)(cmd);
      })
      .catch(function () {})
      .then(function () {
        setTimeout(poll, delay);
      });
  }

  window.__simAgent = { measure: measure, info: info, controls: controls, units: units, viewport: viewport, rectOf: rectOf, version: 1 };

  if (!CFG.poll) return;
  // The view cookie the demo needs ("/" opens Player Mode); set once, never over an existing one.
  if (CFG.cookie && document.cookie.indexOf(CFG.cookie.split("=")[0] + "=") < 0) document.cookie = CFG.cookie + "; path=/; max-age=31536000; samesite=lax";
  window.addEventListener("error", function (e) {
    if (errorsSent++ < 30) post("page-error", { message: String(e.message || "").slice(0, 300), source: String(e.filename || "").replace(/^https?:\/\/[^/]+/, "").slice(0, 120), line: e.lineno || null });
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (errorsSent++ < 30) post("page-error", { message: ("unhandled rejection: " + String(e.reason && e.reason.message ? e.reason.message : e.reason)).slice(0, 300) });
  });
  ["error", "warn"].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      try {
        if (errorsSent++ < 30) post("console-" + level, { message: Array.prototype.map.call(arguments, String).join(" ").slice(0, 300) });
      } catch (e) {
        // ignore
      }
      return orig.apply(console, arguments);
    };
  });
  post("hello", info());
  document.addEventListener("DOMContentLoaded", safe(function () {
    new MutationObserver(check).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "data-entered", "data-closing", "hidden"] });
    check();
  }));
  window.addEventListener("load", function () {
    setTimeout(
      safe(function () {
        post("ready", info());
      }),
      300,
    );
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) post("hello", info());
  });
  document.addEventListener("visibilitychange", function () {
    post("visibility", { state: document.visibilityState, standalone: isStandalone() });
  });
  ["pushState", "replaceState"].forEach(function (name) {
    var orig = history[name];
    history[name] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        post("nav", { path: location.pathname + location.search, how: name });
      }, 0);
      return r;
    };
  });
  window.addEventListener("popstate", function () {
    post("nav", { path: location.pathname + location.search, how: "popstate" });
  });
  poll();
})();
