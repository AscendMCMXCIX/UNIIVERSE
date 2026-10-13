import type { ReactNode } from "react";
import { BRAND_BACKDROP_URL, BRAND_WORDMARK_URL } from "@/domain/branding";

/**
 * Full-page frame for the sign-in, first-run and invite pages: the brand backdrop with the
 * wordmark above a single card. Inside the app the shell stays flat; this is the front door.
 */
export function BrandFrame({ eyebrow, children, width = "max-w-sm" }: { eyebrow: string; children: ReactNode; width?: string }) {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-6" style={{ backgroundImage: `url(${BRAND_BACKDROP_URL})`, backgroundSize: "cover", backgroundPosition: "center" }}>
      <div className="absolute inset-0 bg-bg/55" aria-hidden />
      <div className={`relative w-full ${width}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND_WORDMARK_URL} alt="UNIIVERSE" className="mx-auto mb-5 h-14 w-auto" />
        <div className="rounded-lg border border-border/80 bg-surface/95 p-6 shadow-[0_0_60px_-20px_var(--color-accent)] backdrop-blur-sm">
          <div className="text-[10px] tracking-[0.35em] text-accent">{eyebrow}</div>
          {children}
        </div>
      </div>
    </main>
  );
}
