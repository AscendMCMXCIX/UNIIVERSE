"use server";

import { revalidatePath } from "next/cache";
import { getAppDb } from "@/server/bootstrap";
import { requireOwner } from "@/server/auth/session";
import { DEFAULT_BRANDING, MAX_LOGO_CHARS, type Branding } from "@/domain/branding";
import { saveBranding } from "@/server/repositories/branding";

type Result = { ok: true; data: Branding } | { ok: false; error: string };

export async function saveBrandingAction(input: Partial<Branding>): Promise<Result> {
  try {
    await requireOwner();
    if (input.logoDataUrl && input.logoDataUrl.length > MAX_LOGO_CHARS) return { ok: false, error: "Logo too large: use a PNG/SVG/WebP under 150 KB." };
    const db = await getAppDb();
    const saved = await saveBranding(db, input);
    revalidatePath("/", "layout");
    return { ok: true, data: saved };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function resetBrandingAction(): Promise<Result> {
  return saveBrandingAction(DEFAULT_BRANDING);
}
