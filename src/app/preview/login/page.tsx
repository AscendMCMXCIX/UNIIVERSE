import { BrandFrame } from "@/components/auth/brand-frame";
import { LoginCard } from "@/app/login/login-card";
import { requirePreviewAccess } from "../guard";
import { PreviewBadge } from "../preview-badge";

export const dynamic = "force-dynamic";

/**
 * Admin → Previews: the real sign-in page (same frame, same card, current branding) with the
 * form disconnected: submitting sends nothing and signs nobody in.
 */
export default async function LoginPreviewPage() {
  await requirePreviewAccess();
  return (
    <>
      <PreviewBadge />
      <BrandFrame eyebrow="PRIVATE">
        <LoginCard next="" preview />
      </BrandFrame>
    </>
  );
}
