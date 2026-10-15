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

/** The frame with the site's current branding (the real sign-in and setup pages). */
export async function BrandFrame({ eyebrow, children, width = "max-w-sm" }: { eyebrow: string; children: ReactNode; width?: string }) {
  return (
    <BrandFrameView branding={await loadBranding()} eyebrow={eyebrow} width={width}>
      {children}
    </BrandFrameView>
  );
}
