"use client";

import * as React from "react";
import { DetailModal } from "@/components/ui/detail-modal";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/app/login/login-form";

/*
  Signing in from the public page: a small window over the dimmed page, never a page of its own.
  The window holds the same sign-in form as /login (LoginForm and loginAction: the same throttling,
  generic errors, temporary passwords and first-time setup), and a successful sign-in goes where
  /login sends people. /login stays for direct links, protected pages, expired sessions and adding
  another account; every Sign In link here points at it, so a new tab or a page without script
  still signs in.
*/

const SignInContext = React.createContext<(() => void) | null>(null);

export interface SignInBrand {
  logo: string | null;
  logoStill: string | null;
  shortName: string;
}

/** Hosts the sign-in window once, for every Sign In link on the page. `preview`: Admin → Previews, where the form sends nothing. */
export function SignInProvider({ brand, preview = false, children }: { brand: SignInBrand; preview?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const show = React.useCallback(() => setOpen(true), []);
  return (
    <SignInContext.Provider value={show}>
      {children}
      {open ? <SignInWindow brand={brand} preview={preview} onClose={() => setOpen(false)} /> : null}
    </SignInContext.Provider>
  );
}

/**
 * A Sign In link. A plain click opens the window; a click that asks for a new tab or window (or a
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

function SignInWindow({ brand, preview, onClose }: { brand: SignInBrand; preview: boolean; onClose: () => void }) {
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
        <div className="flex flex-col items-center px-6 pb-4 pt-6 text-center sm:px-8 sm:pb-5 sm:pt-7 short:flex-row short:gap-3 short:py-3 short:text-left">
          <BrandMark src={brand.logo} still={brand.logoStill} name={brand.shortName} className="h-10 w-10 rounded-xl text-base shadow-lg shadow-black/30 ring-1 ring-border-strong sm:h-12 sm:w-12 sm:text-lg short:h-9 short:w-9" />
          <div className="min-w-0">
            <h2 id="sign-in-title" className="mt-3 text-xl font-semibold tracking-tight sm:mt-4 short:mt-0 short:text-lg">
              Sign in
            </h2>
            <p className="mt-1 max-w-[22rem] text-sm text-fg-muted short:mt-0">For members of the team. There is no sign-up: admins create every account.</p>
          </div>
        </div>
      }
    >
      {/* The form keeps its own top margin on /login; here the window's padding already gives that room. */}
      <div ref={body} className="-mt-3">
        <LoginForm next="" preview={preview} />
      </div>
    </DetailModal>
  );
}
