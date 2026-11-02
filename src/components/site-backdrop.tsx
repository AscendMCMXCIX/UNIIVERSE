import { appBackgroundSrc, appBackgroundStillSrc, brandThemeCss, type Branding } from "@/domain/branding";
import { backdropCss } from "@/lib/backdrop";
import { BrandImage } from "./brand-image";

/**
 * The team's colours and the app background, shared by the member app and the public pages. The
 * background sits under a veil in the page colour, as visible as the team's branding says (Admin →
 * Branding; lib/backdrop), the same on every page. The variables come with the page, so it never
 * flashes from another level; reduced motion gets the still frame of a GIF. Cards and panels keep
 * their own surfaces.
 */
export function SiteBackdrop({ branding: b }: { branding: Branding }) {
  const themeCss = brandThemeCss(b);
  const backdrop = appBackgroundSrc(b);
  const backdropStill = appBackgroundStillSrc(b);
  return (
    <>
      {/* Branding colours: validated hex values only. */}
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      {backdrop ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden" data-testid="brand-backdrop">
          <style data-testid="backdrop-style">{backdropCss(b.backdropLevel)}</style>
          <BrandImage src={backdrop} still={backdropStill} className="h-full w-full object-cover opacity-[var(--backdrop-art,0.75)]" />
          <div className="absolute inset-0 bg-bg opacity-[var(--backdrop-veil,0.62)]" data-testid="brand-backdrop-veil" />
          {/* The page's ambient light (globals.css), over the veil, so it is the same with or without artwork. */}
          <div className="absolute inset-0 bg-[image:var(--ambient-light)]" />
          {/* The edges stay calmer than the middle, and a little depth at the bottom for long pages. */}
          <div className="absolute inset-0 opacity-[var(--backdrop-vignette,0.425)]" style={{ background: "radial-gradient(ellipse 75% 65% at 55% 40%, transparent 40%, var(--color-bg) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-bg/40" />
        </div>
      ) : null}
    </>
  );
}
