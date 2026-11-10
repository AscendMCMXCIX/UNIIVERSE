"use client";

import * as React from "react";
import { Check, Copy, Download, Ellipsis, EllipsisVertical, Menu as MenuIcon, MonitorDown, Share, SquarePlus, type LucideIcon } from "lucide-react";
import { DetailModal } from "@/components/ui/detail-modal";
import { Button, buttonClass } from "@/components/ui/button";
import { useBrandNames } from "@/components/brand-names";
import { installGuideFor, type InstallGuide } from "@/domain/install-guide";
import { promptInstall, useInstallState } from "./install-state";
import { cn } from "@/lib/cn";
import { RAIL_FADE, RAIL_HIGHLIGHT, RAIL_HOVER, RAIL_ICON, RAIL_ICON_IDLE, RAIL_ROW } from "@/lib/sidebar";
import { ACCOUNT_ROW, ACCOUNT_ROW_ICON, ACCOUNT_ROW_IDLE } from "@/lib/sheet";

/*
  Install App: one entry beside Settings (sidebar and phone menu), and one in the public team
  page's header, each opening one small window.
  - Where the browser has offered to install (Chromium on Windows, Android, macOS, Linux and
    ChromeOS), the window's main button shows the browser's own install dialog. The offer is used
    once: dismissed, the window shows the browser's own way to install instead.
  - iPhone and iPad: the Share → Add to Home Screen steps for Safari or the browser in use (no
    browser there can install from a page).
  - Elsewhere: the exact steps for that browser, or the honest alternative (another browser),
    never a button that does nothing.
  The entry is hidden in the installed app (its display mode) and once installed from this tab;
  nothing is remembered, so no other browser or device assumes it is installed.
*/

const InstallContext = React.createContext<() => void>(() => undefined);

/** Hosts the install window once, for the sidebar's and the phone menu's entries. */
export function InstallAppProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const show = React.useCallback(() => setOpen(true), []);
  return (
    <InstallContext.Provider value={show}>
      {children}
      {open ? <InstallWindow onClose={() => setOpen(false)} /> : null}
    </InstallContext.Provider>
  );
}

/**
 * The Install App entry, styled as the navigation it sits in. Rendered on the server and hidden
 * by CSS in the installed app's display modes (so the installed app never shows it, even for a
 * moment), and by the browser's own signals once the page runs.
 */
export function InstallAppEntry({ variant, beforeOpen, className }: { variant: "sidebar" | "drawer" | "public" | "row"; beforeOpen?: () => void; className?: string }) {
  const openWindow = React.useContext(InstallContext);
  const state = useInstallState();
  if (state.ready && (state.standalone || state.installed)) return null;
  const onClick = () => {
    beforeOpen?.();
    openWindow();
  };
  const hiddenWhenInstalled = "[@media(display-mode:standalone)]:hidden [@media(display-mode:fullscreen)]:hidden [@media(display-mode:minimal-ui)]:hidden [@media(display-mode:window-controls-overlay)]:hidden";
  if (variant === "public") {
    // The public team page's header: discreet, in the same style as Sign in beside it; on a phone
    // the icon alone (a 44 px target), its name kept for screen readers.
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" className={cn(buttonClass("ghost", "sm", "text-fg-muted max-sm:min-w-11"), hiddenWhenInstalled, className)} data-testid="install-app">
        <Download className="h-4 w-4" aria-hidden />
        <span className="max-sm:sr-only">Install App</span>
      </button>
    );
  }
  if (variant === "row") {
    // The phone's account screen: one of its full-width rows (lib/sheet.ts).
    return (
      <button type="button" onClick={onClick} aria-haspopup="dialog" className={cn(ACCOUNT_ROW, ACCOUNT_ROW_IDLE, hiddenWhenInstalled, className)} data-testid="install-app">
        <Download className={cn(ACCOUNT_ROW_ICON, "text-fg-subtle")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">Install App</span>
      </button>
    );
  }
  return variant === "sidebar" ? (
    <button type="button" onClick={onClick} aria-haspopup="dialog" title="Install App" className={cn(RAIL_ROW, "font-medium text-fg-muted hover:text-fg", hiddenWhenInstalled, className)} data-testid="install-app">
      <span className={cn(RAIL_HIGHLIGHT, RAIL_HOVER)} aria-hidden />
      <Download className={cn(RAIL_ICON, RAIL_ICON_IDLE)} aria-hidden />
      {/* Collapsed sidebar: the icon only; the label stays for screen readers and as the tooltip. */}
      <span className={cn("truncate", RAIL_FADE)}>Install App</span>
    </button>
  ) : (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={cn("flex min-h-12 w-full items-center gap-3 rounded-lg pl-[0.9375rem] pr-3 text-left text-sm text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent", hiddenWhenInstalled, className)} data-testid="install-app">
      <Download className="h-[1.125rem] w-[1.125rem] text-fg-subtle" aria-hidden /> Install App
    </button>
  );
}

type Phase = "ready" | "asking" | "accepted" | "dismissed";

function InstallWindow({ onClose }: { onClose: () => void }) {
  const { productName: name } = useBrandNames();
  const state = useInstallState();
  const [phase, setPhase] = React.useState<Phase>("ready");
  // Read once, on the person's click: what this browser can do (never rendered on the server).
  const [guide] = React.useState<InstallGuide>(() => installGuideFor(navigator.userAgent, { maxTouchPoints: navigator.maxTouchPoints }));
  const mobile = guide.kind === "android" || guide.kind === "ios";
  const offer = state.canPrompt && phase === "ready";
  // With the browser's offer, the window opens on Install (the browser still asks before
  // installing); otherwise on Close, as every window does, ahead of the steps.
  const confirm = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    confirm.current?.focus();
  }, []);

  const install = async () => {
    setPhase("asking");
    const outcome = await promptInstall();
    setPhase(outcome === "accepted" ? "accepted" : outcome === "dismissed" ? "dismissed" : "ready");
  };

  const description =
    phase === "accepted"
      ? undefined
      : offer || phase === "asking"
        ? mobile
          ? "Adds it to your home screen. It opens full screen, like an app."
          : "Opens it in its own window, like an app, with a shortcut among your apps."
        : leadFor(guide, name);

  return (
    <DetailModal
      open
      onClose={onClose}
      size="compact"
      title={`Install ${name}`}
      description={description}
      testId="install-window"
      // Room between the last step and the buttons is the window's own (1rem): a centred card,
      // whose footer keeps clear of the bottom edge and the home indicator (DetailModal).
      footer={
        offer ? (
          <>
            <Button variant="ghost" onClick={onClose} data-testid="install-not-now">
              Not now
            </Button>
            <button type="button" ref={confirm} onClick={() => void install()} className={buttonClass("primary")} data-testid="install-confirm">
              <Download className="h-4 w-4" aria-hidden /> Install
            </button>
          </>
        ) : (
          // Once the browser's prompt is up, focus moves here from the Install button it replaces.
          <Button variant={phase === "accepted" ? "primary" : "secondary"} onClick={onClose} autoFocus={phase !== "ready"} data-testid="install-done">
            Done
          </Button>
        )
      }
    >
      <div className="space-y-4" data-testid="install-body" data-guide={guide.kind} data-phase={offer ? "offer" : phase}>
        <AppIdentity name={name} />
        <p role="status" className="empty:hidden text-sm" data-testid="install-status">
          {phase === "asking" ? <span className="text-fg-muted">{"Follow your browser's prompt to finish."}</span> : null}
          {phase === "accepted" ? (
            <span className="inline-flex items-start gap-2 text-fg">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden />
              {mobile ? `Installed. ${name} is on your home screen.` : `Installed. ${name} opens in its own window; find it with your other apps.`}
            </span>
          ) : null}
          {phase === "dismissed" ? <span className="text-fg-muted">Not installed. You can still install it this way:</span> : null}
        </p>
        {!offer && phase !== "asking" && phase !== "accepted" ? <GuideSteps guide={guide} name={name} /> : null}
      </div>
    </DetailModal>
  );
}

/** The app as it will appear once installed: its icon (the manifest's) and name. */
function AppIdentity({ name }: { name: string }) {
  // Only ever rendered in the browser (the window opens on a click).
  const [host] = React.useState(() => window.location.host);
  return (
    // A phone held sideways keeps its few lines for the steps: the title already names the app.
    <div className="flex items-center gap-3 short:hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-panel border border-border" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-fg">{name}</p>
        {host ? <p className="truncate text-xs text-fg-subtle">{host}</p> : null}
      </div>
    </div>
  );
}

/** A control's name as people see it on screen, with its icon. */
function Key({ icon: Icon, children }: { icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <strong className="whitespace-nowrap font-semibold text-fg">
      {children}
      {Icon ? <Icon className="ml-1 inline-block h-4 w-4 align-[-0.2em] text-accent" aria-hidden /> : null}
    </strong>
  );
}

/** An icon as it appears in the browser, inline in a sentence (its name is in the sentence). */
function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="mx-0.5 inline-block h-4 w-4 align-[-0.2em] text-accent" aria-hidden />;
}

function Steps({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5" data-testid="install-steps">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm leading-snug text-fg-muted">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent" aria-hidden>
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-snug text-fg-subtle">{children}</p>;
}

/** Copies the app's address, to open it in another browser. */
function CopyLink() {
  const [state, setState] = React.useState<"idle" | "copied" | "failed">("idle");
  const url = `${window.location.origin}/`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  };
  return (
    <div className="space-y-1.5">
      <Button size="sm" variant="secondary" onClick={() => void copy()} data-testid="install-copy-link">
        {state === "copied" ? <Check className="h-4 w-4 text-good" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {state === "copied" ? "Link copied" : "Copy link"}
      </Button>
      <p role="status" className="empty:hidden text-xs text-fg-muted">
        {state === "failed" ? (
          <>
            Copy this address: <span className="select-all break-all font-medium text-fg">{url}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

/** The one-line summary under the title, for the browser's own route. */
function leadFor(guide: InstallGuide, name: string): string {
  switch (guide.kind) {
    case "ios":
      return guide.canAdd ? "Add it to your Home Screen. It opens full screen, like an app." : "On this version of iOS, only Safari can add apps to the Home Screen.";
    case "android":
      return "Add it to your home screen. It opens full screen, like an app.";
    case "desktop":
      return "Install it to open it in its own window, like an app.";
    case "mac-safari":
      return guide.canAdd ? "Add it to the Dock. It opens in its own window, like an app." : "This version of Safari can't add web apps to the Dock (Safari 17 and later can).";
    case "firefox-desktop":
      return "Firefox doesn't install web apps.";
    case "in-app":
      return `This page is open in ${guide.app ? `${guide.app}'s` : "an app's"} built-in browser, which can't install apps.`;
    case "unknown":
      return `This browser didn't offer to install ${name}.`;
  }
}

/** The steps for this browser, in its own words. */
function GuideSteps({ guide, name }: { guide: InstallGuide; name: string }) {
  switch (guide.kind) {
    case "ios": {
      if (!guide.canAdd)
        return (
          <div className="space-y-3">
            <Steps steps={["Copy the link below.", "Open Safari, paste it into the address bar and go.", <>Sign in, then choose <Key>Install App</Key> there.</>]} />
            <CopyLink />
          </div>
        );
      const safari = guide.browser === "safari";
      // Safari 26 moved Share into the More menu beside the address bar (compact layout, the default).
      const share = safari ? (
        guide.device === "ipad" ? (
          guide.webAppSwitch === "no" ? (
            <>
              Tap <Key icon={Share}>Share</Key> at the top right.
            </>
          ) : (
            <>
              Tap <Key icon={Share}>Share</Key> at the top right, or under <Key icon={Ellipsis}>More</Key>.
            </>
          )
        ) : guide.webAppSwitch === "yes" ? (
          <>
            Tap <Key icon={Ellipsis}>More</Key> beside the address bar, then <Key icon={Share}>Share</Key>.
          </>
        ) : guide.webAppSwitch === "maybe" ? (
          <>
            Tap <Key icon={Share}>Share</Key> (on iOS 26, under <Key icon={Ellipsis}>More</Key> beside the address bar).
          </>
        ) : (
          <>
            Tap <Key icon={Share}>Share</Key> at the bottom of the screen.
          </>
        )
      ) : guide.browser === "chrome" ? (
        <>
          Tap <Key icon={Share}>Share</Key> in the address bar.
        </>
      ) : (
        <>
          {"Open the browser's menu, then tap "}<Key icon={Share}>Share</Key>.
        </>
      );
      const add =
        guide.webAppSwitch === "yes" ? (
          <>
            Leave <Key>Open as Web App</Key> on, then tap <Key>Add</Key>.
          </>
        ) : guide.webAppSwitch === "maybe" ? (
          <>
            Tap <Key>Add</Key> (if you see <Key>Open as Web App</Key>, leave it on).
          </>
        ) : (
          <>
            Tap <Key>Add</Key>.
          </>
        );
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              share,
              <>
                Choose <Key icon={SquarePlus}>Add to Home Screen</Key>. {guide.webAppSwitch === "no" ? "Scroll down if you don't see it." : <>Not listed? Tap <Key>View More</Key> or scroll down.</>}
              </>,
              add,
            ]}
          />
          {safari ? null : (
            <div className="space-y-2">
              <Note>{"Can't find it? Open this page in Safari and add it from there."}</Note>
              <CopyLink />
            </div>
          )}
        </div>
      );
    }
    case "android": {
      const menu =
        guide.browser === "samsung" ? (
          <>
            Tap <Key icon={MenuIcon}>Menu</Key> at the bottom right.
          </>
        ) : guide.browser === "edge" ? (
          <>
            Tap <Key icon={Ellipsis}>Menu</Key>.
          </>
        ) : guide.browser === "chrome" ? (
          <>
            Tap <Key icon={EllipsisVertical}>Menu</Key> at the top right.
          </>
        ) : guide.browser === "firefox" ? (
          <>
            Tap <Key icon={EllipsisVertical}>Menu</Key>.
          </>
        ) : (
          "Open the browser's menu."
        );
      const action =
        guide.browser === "samsung" ? (
          <>
            Tap <Key>Add page to</Key>, then <Key>Home screen</Key>.
          </>
        ) : guide.browser === "edge" ? (
          <>
            Tap <Key>Add to phone</Key> (or <Key>Add to Home screen</Key>).
          </>
        ) : guide.browser === "firefox" ? (
          <>
            Tap <Key>Install</Key> (or <Key>Add to Home screen</Key>).
          </>
        ) : (
          <>
            Tap <Key>Install app</Key> (or <Key>Add to Home screen</Key>, then <Key>Install</Key>).
          </>
        );
      return (
        <div className="space-y-3">
          <Steps steps={[menu, action]} />
          <Note>If an install icon shows in the address bar, tapping it does the same. Already installed? Open {name} from your home screen.</Note>
        </div>
      );
    }
    case "desktop": {
      const where = guide.os === "windows" ? "the Start menu" : guide.os === "mac" ? "your Applications folder or Launchpad" : guide.os === "chromeos" ? "the launcher" : "your apps";
      const menu =
        guide.browser === "chrome" ? (
          <>
            Or open <Key icon={EllipsisVertical}>Menu</Key> → <Key>Cast, save and share</Key> → <Key>Install page as app</Key>.
          </>
        ) : guide.browser === "edge" ? (
          <>
            Or open <Key icon={Ellipsis}>Menu</Key> → <Key>Apps</Key> → <Key>Install this site as an app</Key>.
          </>
        ) : (
          <>
            Or look for <Key>Install</Key> {"in the browser's menu."}
          </>
        );
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              guide.browser === "edge" ? (
                <>
                  Click <Key>App available</Key> at the right end of the address bar.
                </>
              ) : (
                <>
                  Click the install icon <Glyph icon={MonitorDown} /> at the right end of the address bar.
                </>
              ),
              menu,
              <>
                Confirm with <Key>Install</Key>.
              </>,
            ]}
          />
          <Note>
            Already installed? Open {name} from {where}.{guide.browser === "chrome" || guide.browser === "edge" ? null : " If this browser has no install, Microsoft Edge and Google Chrome do."}
          </Note>
        </div>
      );
    }
    case "mac-safari":
      return guide.canAdd ? (
        <Steps
          steps={[
            <>
              In the menu bar, choose <Key>File</Key> → <Key>Add to Dock</Key>.
            </>,
            <>
              Click <Key>Add</Key>.
            </>,
          ]}
        />
      ) : (
        <div className="space-y-3">
          <Note>Update macOS, or open {name} in Google Chrome or Microsoft Edge to install it.</Note>
          <CopyLink />
        </div>
      );
    case "firefox-desktop":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              "Copy the link below.",
              <>
                Open it in <Key>Microsoft Edge</Key> or <Key>Google Chrome</Key>.
              </>,
              <>
                Choose <Key>Install App</Key> there, or the install icon in the address bar.
              </>,
            ]}
          />
          <CopyLink />
          <Note>{`A bookmark in Firefox opens ${name} too, but it isn't an installed app.`}</Note>
        </div>
      );
    case "in-app":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              guide.os === "ios" ? (
                <>
                  Open this page in Safari: look for <Key>Open in Safari</Key> or <Key>Open in browser</Key> {"in this app's menu, or copy the link."}
                </>
              ) : (
                <>
                  Open this page in your browser: look for <Key>Open in browser</Key> {"in this app's menu, or copy the link."}
                </>
              ),
              <>
                Sign in, then choose <Key>Install App</Key> there.
              </>,
            ]}
          />
          <CopyLink />
        </div>
      );
    case "unknown":
      return (
        <div className="space-y-3">
          <Steps
            steps={[
              <>
                Look for <Key>Install</Key> or <Key>Add to Home Screen</Key> {"in the browser's menu."}
              </>,
            ]}
          />
          <Note>Microsoft Edge, Google Chrome, and Safari on iPhone and iPad can all install {name}.</Note>
          <CopyLink />
        </div>
      );
  }
}
