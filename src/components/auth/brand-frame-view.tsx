import type { ReactNode } from "react";
import { backgroundSrc, backgroundStillSrc, brandThemeCss, logoSrc, logoStillSrc, type Branding } from "@/domain/branding";
import { BrandImage } from "@/components/brand-image";
import { BrandNamesProvider } from "@/components/brand-names";
import { cn } from "@/lib/cn";

/**
 * The full-page frame of the sign-in, first-time setup, first-run and recovery pages, drawn from
 * the given branding (Admin → Previews renders this same component with the live branding).
 *
 * Layout: the page is a vertical flex column that can scroll, and the logo + card block is
 * centred with automatic margins. When the window is tall enough the block sits in the optical
 * centre (a little above the middle, as the eye expects); when it is not (a short laptop window,
 * a phone in landscape, a virtual keyboard), it starts at the top and the page scrolls instead of
 * cutting the block off. Safe-area insets keep it clear of notches. The backdrop is fixed behind
 * it: the uploaded sign-in background (still frame for reduced motion) under a veil, or, with
 * none uploaded, a plain background in the theme colours (no stock image). Without an uploaded
 * logo the team name is set as text.
 */
/** The frame's top padding: clear of the status bar and notch. */
const PAD_TOP = "pt-[max(1.5rem,env(safe-area-inset-top))]";
/** The top padding of a preview page, which also clears the "Preview" badge fixed above it. */
export const PREVIEW_PAD_TOP = "pt-[calc(3.25rem+env(safe-area-inset-top))]";

export function BrandFrameView({ branding: b, eyebrow, children, width = "max-w-sm", fixedBackdrop = true, padTop = PAD_TOP, className }: { branding: Branding; eyebrow: string; children: ReactNode; width?: string; fixedBackdrop?: boolean; /** Replaces the top padding (a class list merges nothing here). */ padTop?: string; className?: string }) {
  const themeCss = brandThemeCss(b);
  const background = backgroundSrc(b);
  const logo = logoSrc(b);
  return (
    <main className={cn("relative isolate flex min-h-dvh flex-col overflow-x-hidden px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6", padTop, className)} data-testid="brand-frame">
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      <div aria-hidden className={cn(fixedBackdrop ? "fixed" : "absolute", "inset-0 -z-10 overflow-hidden bg-bg")} data-testid="brand-frame-backdrop">
        {background ? (
          <>
            <BrandImage src={background} still={backgroundStillSrc(b)} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-bg/55" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,color-mix(in_srgb,var(--color-accent)_22%,transparent),transparent_60%),radial-gradient(ellipse_at_50%_120%,color-mix(in_srgb,var(--color-accent2,var(--color-accent))_12%,transparent),transparent_55%)]" data-testid="brand-frame-plain" />
        )}
      </div>
      {/* m-auto centres the block when there is room; the small bottom padding lifts it to the optical centre. */}
      <div className={cn("relative mx-auto my-auto w-full pb-[4vh]", width)} data-testid="brand-frame-block">
        {logo ? (
          <div className="mb-5 flex items-center justify-center gap-3">
            <BrandImage src={logo} still={logoStillSrc(b)} alt="" className="h-14 w-14 rounded-panel object-contain" />
            <span className="text-2xl font-bold tracking-label text-fg">{b.shortName}</span>
          </div>
        ) : (
          <p className="mb-5 text-center text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-none tracking-wordmark text-fg" data-testid="brand-wordmark-text">
            {b.shortName}
          </p>
        )}
        <div className="rounded-lg border border-border/80 bg-surface/95 p-4 shadow-[0_0_60px_-20px_var(--color-accent)] backdrop-blur-sm sm:p-6">
          <div className="text-xs tracking-tagline text-accent">{eyebrow}</div>
          <BrandNamesProvider names={b}>{children}</BrandNamesProvider>
        </div>
      </div>
    </main>
  );
}

