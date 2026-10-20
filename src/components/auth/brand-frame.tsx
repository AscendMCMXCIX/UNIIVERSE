import type { ReactNode } from "react";
import { DEFAULT_BRANDING, type Branding } from "@/domain/branding";
import { getAppDb } from "@/server/bootstrap";
import { getBranding } from "@/server/repositories/branding";
import { BrandFrameView } from "./brand-frame-view";

export { BrandFrameView };

async function loadBranding(): Promise<Branding> {
  try {
    return await getBranding(await getAppDb());
  } catch {
    // The sign-in page must render even when the database is unreachable.
    return DEFAULT_BRANDING;
  }
}

/** The frame with the site's current branding (the real sign-in and setup pages). The eyebrow may name the app (it gets the branding). */
export async function BrandFrame({ eyebrow, children, width = "max-w-sm", padTop }: { eyebrow: string | ((b: Branding) => string); children: ReactNode; width?: string; padTop?: string }) {
  const branding = await loadBranding();
  return (
    <BrandFrameView branding={branding} eyebrow={typeof eyebrow === "function" ? eyebrow(branding) : eyebrow} width={width} padTop={padTop}>
      {children}
    </BrandFrameView>
  );
}
