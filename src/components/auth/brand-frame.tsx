import type { ReactNode } from "react";
import { BRAND_BACKDROP_URL, BRAND_WORDMARK_URL, backgroundSrc, backgroundStillSrc, brandThemeCss, DEFAULT_BRANDING, logoSrc, logoStillSrc, type Branding } from "@/domain/branding";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { BrandImage } from "@/components/brand-image";

async function loadBranding(): Promise<Branding> {
  try {
    return await getBranding(await getAppDb());
  } catch {
    // The sign-in page must render even when the database is unreachable.
    return DEFAULT_BRANDING;
  }
}

/**
 * Full-page frame for the sign-in, first-run and recovery pages: the brand backdrop (a custom
 * background may be animated here; reduced motion gets its still frame) with the wordmark or the
 * team's logo and name above a single card. Inside the app the shell stays flat.
 */
export async function BrandFrame({ eyebrow, children, width = "max-w-sm" }: { eyebrow: string; children: ReactNode; width?: string }) {
  const b = await loadBranding();
  const themeCss = brandThemeCss(b);
  const background = backgroundSrc(b);
  const customLogo = b.assets.logo !== null;
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden p-4 pt-safe pb-safe sm:p-6">
      {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      <BrandImage src={background ?? BRAND_BACKDROP_URL} still={background ? backgroundStillSrc(b) : null} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-bg/55" aria-hidden />
      <div className={`relative w-full ${width}`}>
        {customLogo ? (
          <div className="mb-5 flex items-center justify-center gap-3">
            <BrandImage src={logoSrc(b)} still={logoStillSrc(b)} alt="" className="h-14 w-14 rounded-xl object-contain" />
            <span className="text-2xl font-bold tracking-[0.12em] text-fg">{b.shortName}</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={BRAND_WORDMARK_URL} alt="UNIIVERSE" className="mx-auto mb-5 h-12 w-auto sm:h-14" />
        )}
        <div className="rounded-lg border border-border/80 bg-surface/95 p-4 shadow-[0_0_60px_-20px_var(--color-accent)] backdrop-blur-sm sm:p-6">
          <div className="text-[11px] tracking-[0.3em] text-accent">{eyebrow}</div>
          {children}
        </div>
      </div>
    </main>
  );
}
