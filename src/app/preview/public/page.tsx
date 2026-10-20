import { PublicPage } from "@/components/public/public-page";
import { requirePreviewAccess } from "../guard";
import { PreviewBadge } from "../preview-badge";

export const dynamic = "force-dynamic";

/**
 * Admin → Previews: the public page exactly as a visitor sees it (Sign In, not Open App), with the
 * sign-in window disconnected: submitting sends nothing and signs nobody in.
 */
export default async function PublicPreviewPage() {
  await requirePreviewAccess();
  return (
    <>
      <PreviewBadge />
      <div className="pt-11">
        <PublicPage member={false} preview />
      </div>
    </>
  );
}
