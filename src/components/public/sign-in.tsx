"use client";

import * as React from "react";
import { CLEAR_OF_CONTROLS, DetailModal } from "@/components/ui/detail-modal";
import { cn } from "@/lib/cn";
import { useKeyboardFit } from "@/components/ui/keyboard-fit";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/app/login/login-form";

/*
  Signing in from the public team page: a window over the page, never a page of its own (a small
  centred window on wider screens, the whole screen on phones). The window holds the same sign-in
  form as /login (LoginForm and loginAction: the same throttling, generic errors, temporary
  passwords and first-time setup), and a successful sign-in goes where /login sends people. /login
  stays for direct links, protected pages and expired sessions; every Sign in link here points at
  it, so a new tab or a page without script still signs in.
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
  // While a phone's keyboard is up, the window fits the part of the screen above it, and the
  // words above the form step aside so the fields and Sign in stay in view together.
  const keyboard = useKeyboardFit(body);
  // Straight to the username once the window is open (the window's own opening would otherwise
  // focus its close button). This runs after the window's showModal: a parent's effect runs after its children's.
  React.useEffect(() => {
    body.current?.querySelector<HTMLInputElement>("input[name=username]")?.focus();
  }, []);
  return (
    <DetailModal
      open
      onClose={onClose}
      size="form"
      title="Sign in"
      titleId="sign-in-title"
      testId="sign-in-window"
      bodyTestId="sign-in-body"
      // The window keeps 1rem under the last line on a phone, or the home indicator's inset where it
      // is larger (DetailModal's own body padding); held sideways too, rather than the wider screens'
      // 1.25rem, so the form keeps its few lines.
      bodyClassName="short:pb-safe-4"
      header={
        // The brand as in the public page's header; it stays at the top, with the close button,
        // while the rest scrolls on a short screen.
        <div className={cn("flex min-w-0 items-center gap-3 py-3 pl-5 sm:py-4", CLEAR_OF_CONTROLS)}>
          <BrandMark src={brand.logo} still={brand.logoStill} name={brand.shortName} className="h-9 w-9 text-base" />
          <span className="truncate text-sm font-bold tracking-label text-fg">{brand.shortName}</span>
        </div>
      }
    >
      {/* The sign-in card of /login (BrandFrameView, LoginCard): the same eyebrow, title and words, then the form. */}
      <div ref={body} className="group/sign-in mx-auto w-full max-w-md" data-keyboard={keyboard || undefined}>
        <p className="text-xs tracking-tagline text-accent short:hidden group-data-[keyboard=true]/sign-in:hidden">PRIVATE</p>
        <h2 id="sign-in-title" className="mt-1 text-xl font-bold tracking-wordmark short:mt-0 short:text-lg group-data-[keyboard=true]/sign-in:mt-0 group-data-[keyboard=true]/sign-in:text-lg">
          Sign in
        </h2>
        <p className="mt-2 text-sm text-fg-muted short:hidden group-data-[keyboard=true]/sign-in:hidden">Sign in with your username and password. There is no sign-up: admins create every account.</p>
        <LoginForm next="" />
      </div>
    </DetailModal>
  );
}
