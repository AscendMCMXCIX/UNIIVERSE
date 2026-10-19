import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAppDb } from "@/server/bootstrap";
import { getAuthState } from "@/server/auth/session";
import { getBranding } from "@/server/repositories/branding";
import { getPublicAccess } from "@/server/public/access";
import { logoSrc, logoStillSrc } from "@/domain/branding";
import { SiteBackdrop } from "@/components/site-backdrop";
import { BrandMark } from "@/components/brand-mark";
import { buttonClass } from "@/components/ui/button";
import { RIOT_LEGAL } from "@/components/app-shell";

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
 * THE PUBLIC PAGES: what a visitor without an account sees, read-only. Off (404) until an admin
 * turns them on; signed-in members can preview them meanwhile. Everything here is built from the
 * public loaders (server/public), never from the members' pages, and nothing here starts a data
 * refresh or calls Riot: a visit only reads what is stored.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const db = await getAppDb();
  const [auth, access, branding] = await Promise.all([getAuthState(db), getPublicAccess(db), getBranding(db)]);
  const member = !!auth.session;
  if (!access.enabled && !member) notFound();
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteBackdrop branding={branding} />
      {member ? (
        <p className="relative border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-xs text-fg-muted" data-testid="public-preview-banner">
          {access.enabled ? "You're signed in: this is the public page exactly as visitors see it." : "Preview: the public page is off, so only signed-in members can open it."}{" "}
          <Link href="/" className="font-medium text-accent hover:underline">
            Back to the app
          </Link>
        </p>
      ) : null}
      <header className="relative mx-auto flex w-full max-w-[var(--content-wide)] items-center justify-between gap-3 px-4 py-3 sm:px-6" data-testid="public-header">
        <Link href="/public" className="flex min-w-0 items-center gap-3 rounded-lg">
          <BrandMark src={logoSrc(branding)} still={logoStillSrc(branding)} name={branding.shortName} className="h-9 w-9 text-base" />
          <span className="truncate text-sm font-bold tracking-[0.12em] text-fg">{branding.shortName}</span>
        </Link>
        <nav aria-label="Public pages" className="flex items-center gap-1">
          <Link href="/public" className="rounded-md px-3 py-2 text-sm font-medium text-fg hover:bg-surface-2/60">
            Team
          </Link>
          {member ? null : (
            <Link href="/login" className={buttonClass("ghost", "sm", "text-fg-muted")} data-testid="public-sign-in">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <main className="relative mx-auto flex w-full max-w-[var(--content-wide)] flex-1 flex-col px-4 pb-8 pt-2 sm:px-6 lg:pt-4">{children}</main>
      <footer className="relative mx-auto w-full max-w-[var(--content-wide)] px-4 pb-6 sm:px-6">
        <p className="text-[0.6875rem] leading-relaxed text-fg-subtle" data-testid="public-legal">
          {RIOT_LEGAL}
        </p>
      </footer>
    </div>
  );
}
