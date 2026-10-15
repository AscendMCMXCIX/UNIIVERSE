import { OnboardingPreview } from "@/components/admin/onboarding-preview";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/components/admin/onboarding-steps";
import { DEFAULT_BRANDING, type Branding } from "@/domain/branding";
import { getAppDb } from "@/server/bootstrap";
import { loadPickerChampions } from "@/server/champions/picker";
import { getBranding } from "@/server/repositories/branding";
import { requirePreviewAccess } from "../guard";
import { PreviewBadge } from "../preview-badge";

export const dynamic = "force-dynamic";

/**
 * Admin → Previews: a new player's whole first sign-in (sign in with the temporary password,
 * choose their own, roles and champions, done), with the real components and the current
 * branding. A practice account stands in for the player; nothing is sent or saved. `?step=` opens
 * a step directly.
 */
export default async function SetupPreviewPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  await requirePreviewAccess();
  const { step } = await searchParams;
  const initialStep: OnboardingStep = ONBOARDING_STEPS.some((s) => s.key === step) ? (step as OnboardingStep) : "signin";
  const db = await getAppDb();
  const [branding, champions] = await Promise.all([getBranding(db).catch((): Branding => DEFAULT_BRANDING), loadPickerChampions(db)]);
  return (
    <>
      <PreviewBadge />
      <OnboardingPreview branding={branding} champions={champions} initialStep={initialStep} />
    </>
  );
}
