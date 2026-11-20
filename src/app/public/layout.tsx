import type { Metadata } from "next";
import Link from "next/link";
import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { getBranding } from "@/server/repositories/branding";
import { logoSrc, logoStillSrc } from "@/domain/branding";
import { SiteBackdrop } from "@/components/site-backdrop";
import { BrandMark } from "@/components/brand-mark";
import { BrandNamesProvider } from "@/components/brand-names";
import { PUBLIC_NAV_LINK } from "@/components/public/nav-link";
import { InstallAppEntry, InstallAppProvider } from "@/components/install/install-app";
import { SignInLink, SignInProvider } from "@/components/public/sign-in";
import { publicRiotDataAllowed } from "@/server/public/access";
import { riotLegal } from "@/components/app-shell";
import { preconnect } from "react-dom";
import { DATA_DRAGON_ORIGIN } from "@/domain/player-card";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const branding = await getBranding(await getAppDb());
    const icon = logoStillSrc(branding);
    return { title: branding.teamName, ...(icon ? { icons: { icon, apple: icon } } : {}) };
  } catch {
    return {};
  }
}

/**
 * THE PUBLIC PAGES: what anyone sees without an account, read-only, always available. Signed-in
 * members see exactly the same page. Everything here is built from the public loaders
 * (server/public), never from the members' pages, and nothing here starts a data refresh or calls
 * Riot: a visit only reads what is stored. Sign in opens a small window over the page (a link to
 * /login underneath, for a new tab or a page without script); Install App sits beside it, hidden
 * in the installed app. Leaderboards joins Team only where Riot data may appear publicly.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const db = await getAppDb();
  const [auth, branding] = await Promise.all([getAuthState(db), getBranding(db)]);
  const member = !!auth.session;
  const leaderboards = publicRiotDataAllowed();
  // The public Team Overview's cards show champion art from Data Dragon (the member layout does the same).
  preconnect(DATA_DRAGON_ORIGIN);
  return (
    <BrandNamesProvider names={{ productName: branding.productName, teamName: branding.teamName }}>
      <InstallAppProvider>
        <SignInProvider brand={{ logo: logoSrc(branding), logoStill: logoStillSrc(branding), shortName: branding.shortName }}>
          <div className="flex min-h-dvh flex-col">
            <SiteBackdrop branding={branding} />
            {/* The mark and the team's name on the left, the pages and Sign in (Open the app) on the
                right, on one line wherever they fit: the name gives way first (truncated, down to
                the mark alone). Larger text on a phone made the links wider than the header (past
                the screen by 42px at 150% on a 320px phone and 163px at 200%; at 125% the mark sat
                under "Team"), so the line wraps instead: the links take a line of their own under
                the mark and the name, on the right, and wrap there too where one line cannot hold
                them. The name starts at its least width (the mark less the gap, which the mark may
                reach into but never past) and grows to its own width, so where everything fits on
                one line it is exactly the line it was. */}
            <header className="relative mx-auto flex w-full max-w-[var(--content-wide)] flex-wrap items-center justify-between gap-x-3 gap-y-1 px-safe-4 pb-3 pt-safe-3 sm:px-safe-6" data-testid="public-header">
              <Link href="/public" className="flex min-w-6 max-w-max grow basis-0 items-center gap-3 rounded-lg pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                <BrandMark src={logoSrc(branding)} still={logoStillSrc(branding)} name={branding.shortName} className="h-9 w-9 text-base" />
                {/* With a second page in the header, phones keep the mark alone: the page's own header names the team. */}
                <span className={`truncate text-sm font-bold tracking-label text-fg${leaderboards ? " max-sm:sr-only" : ""}`}>{branding.shortName}</span>
              </Link>
              <nav aria-label="Public pages" className="ml-auto flex flex-wrap items-center justify-end gap-1">
                <Link href="/public" className={`${PUBLIC_NAV_LINK} text-fg`}>
                  Team
                </Link>
                {leaderboards ? (
                  <Link href="/public/leaderboards" className={`${PUBLIC_NAV_LINK} text-fg max-sm:px-2.5`} data-testid="public-leaderboards-link">
                    Leaderboards
                  </Link>
                ) : null}
                <InstallAppEntry variant="public" />
                {member ? (
                  <Link href="/" className={`${PUBLIC_NAV_LINK} text-fg-muted hover:text-fg`} data-testid="public-open-app">
                    Open the app
                  </Link>
                ) : (
                  <SignInLink className={`${PUBLIC_NAV_LINK} text-fg-muted hover:text-fg`} testId="public-sign-in">
                    Sign in
                  </SignInLink>
                )}
              </nav>
            </header>
            <main className="relative mx-auto flex w-full max-w-[var(--content-wide)] flex-1 flex-col px-safe-4 pb-8 pt-2 sm:px-safe-6 lg:pt-4">{children}</main>
            <footer className="relative mx-auto w-full max-w-[var(--content-wide)] px-safe-4 pb-safe-6 sm:px-safe-6">
              <Link href="/privacy" className="inline-flex min-h-8 items-center text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11" data-testid="public-privacy-link">
                Privacy
              </Link>
              <p className="text-2xs leading-relaxed text-fg-subtle" data-testid="public-legal">
                {riotLegal(branding.productName)}
              </p>
            </footer>
          </div>
        </SignInProvider>
      </InstallAppProvider>
    </BrandNamesProvider>
  );
}
