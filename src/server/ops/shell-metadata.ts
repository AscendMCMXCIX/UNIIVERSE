import type { Metadata } from "next";
import { logoStillSrc } from "@/domain/branding";
import { getBranding } from "@/server/repositories/branding";
import { getAppDb } from "@/server/bootstrap";

/** A custom logo becomes the tab icon in both modes (its still frame: browsers do not animate favicons reliably). */
export async function shellMetadata(): Promise<Metadata> {
  try {
    const branding = await getBranding(await getAppDb());
    const icon = logoStillSrc(branding);
    if (!icon) return {};
    return { icons: { icon, apple: icon } };
  } catch {
    return {};
  }
}
