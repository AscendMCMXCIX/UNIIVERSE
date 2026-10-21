"use client";

import * as React from "react";
import { DetailModal } from "@/components/ui/detail-modal";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/app/login/login-form";

/*
  Signing in from the public team page: a small window over the dimmed page, never a page of its
  own. The window holds the same sign-in form as /login (LoginForm and loginAction: the same
  throttling, generic errors, temporary passwords and first-time setup) in the same card, and a
  successful sign-in goes where /login sends people. /login stays for direct links, protected
  pages, expired sessions and adding another account; every Sign in link here points at it, so a
  new tab or a page without script still signs in.
*/

const SignInContext = React.createContext<(() => void) | null>(null);

export interface SignInBrand {
  logo: string | null;
  logoStill: string | null;
  shortName: string;
}

/** Hosts the sign-in window once, for every Sign in link on the page. */
export function SignInProvider({ brand, children }: { brand: SignInBrand; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const show = React.useCallback(() => setOpen(true), []);
  return (
    <SignInContext.Provider value={show}>
      {children}
      {open ? <SignInWindow brand={brand} onClose={() => setOpen(false)} /> : null}
    </SignInContext.Provider>
  );
}

/**
 * A Sign in link. A plain click opens the window; a click that asks for a new tab or window (or a
 * page whose script has not loaded) follows the link to /login.
 */
export function SignInLink({ className, children, testId }: { className?: string; children: React.ReactNode; testId?: string }) {
  const show = React.useContext(SignInContext);
  return (
    <a
      href="/login"
      className={className}
      aria-haspopup="dialog"
      data-testid={testId}
      onClick={(e) => {
        if (!show || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        show();
      }}
    >
      {children}
    </a>
  );
}

function SignInWindow({ brand, onClose }: { brand: SignInBrand; onClose: () => void }) {
  const body = React.useRef<HTMLDivElement>(null);
  // Straight to the username once the window is open (the window's own opening would otherwise
  // focus its close button). This runs after the window's showModal: a parent's effect runs after its children's.
  React.useEffect(() => {
    body.current?.querySelector<HTMLInputElement>("input[name=username]")?.focus();
  }, []);
  return (
    <DetailModal
      open
      onClose={onClose}
      size="compact"
      title="Sign in"
      titleId="sign-in-title"
      testId="sign-in-window"
      // Phones: room under the last line (the window's own bottom padding is only the safe area there).
      bodyClassName="max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      header={
        // The sign-in card of /login (BrandFrameView, LoginCard) in a window: the brand as in the
        // public page's header, then the same eyebrow, title and words. Held sideways, the brand
        // and the title only, so the form keeps the short screen.
        <div className="pb-4 pl-5 pr-14 pt-5 short:pb-3 short:pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark src={brand.logo} still={brand.logoStill} name={brand.shortName} className="h-9 w-9 text-base" />
            <span className="truncate text-sm font-bold tracking-label text-fg">{brand.shortName}</span>
          </div>
          <p className="mt-5 text-xs tracking-tagline text-accent short:hidden">PRIVATE</p>
          <h2 id="sign-in-title" className="mt-1 text-xl font-bold tracking-wordmark short:mt-3 short:text-lg">
            Sign in
          </h2>
          <p className="mt-2 text-sm text-fg-muted short:hidden">Sign in with your username and password. There is no sign-up: admins create every account.</p>
        </div>
      }
    >
      {/* The form keeps its own top margin on /login; here the window's padding already gives that room. */}
      <div ref={body} className="-mt-3">
        <LoginForm next="" />
      </div>
    </DetailModal>
  );
}
