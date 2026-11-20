import { PAGE_TITLE } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { setupKeyConfigured } from "@/server/auth/recovery";
import { getAppDb } from "@/server/bootstrap";
import { BrandFrame } from "@/components/auth/brand-frame";
import { RecoverForm } from "./recover-form";

export const dynamic = "force-dynamic";

/**
 * Owner recovery: the setup key (UNIIVERSE_ACCESS_PASSWORD) proves ownership, shows the owner
 * username and lets the owner rename it or set a new password, then signs them in.
 */
export default async function RecoverPage() {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (auth.session) redirect("/");
  const configured = setupKeyConfigured();
  return (
    <BrandFrame eyebrow="OWNER RECOVERY" width="max-w-md">
      <h1 className={cn("mt-1", PAGE_TITLE)}>Recover the owner account</h1>
      <p className="mt-2 text-sm text-fg-muted">Sign-in uses a username and password only; there is no email login. Accounts created before usernames existed were given their former display name as username. If you do not know the owner username or password, the setup key proves you own this deployment.</p>
      {configured ? (
        <RecoverForm />
      ) : (
        <div className="mt-4 text-sm text-fg-muted" data-testid="recover-not-configured">
          <p>The setup key is not configured, so recovery cannot run yet.</p>
          {/* The deployment's instructions are the owner's: folded, so the page leads with what it is for (UD.PB2). */}
          <details className="group mt-2 rounded-md border border-border bg-bg-elevated/60" data-testid="recover-instructions">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-fg marker:hidden pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              How to set the setup key
              <ChevronDown className="h-4 w-4 shrink-0 text-fg-subtle transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2 px-3 pb-3">
              <p>Add it in your hosting environment and redeploy, then return here:</p>
              <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg p-3 text-xs [overflow-wrap:anywhere]">UNIIVERSE_ACCESS_PASSWORD=a-long-random-string-only-you-know</pre>
              <p className="text-xs text-fg-subtle">On Vercel: Project → Settings → Environment Variables (Production), then Deployments → ⋯ → Redeploy.</p>
            </div>
          </details>
        </div>
      )}
      <p className="mt-4 text-xs text-fg-subtle">
        Team members who forgot their password ask an administrator to reset it.{" "}
        <Link href="/login" className="text-accent underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </BrandFrame>
  );
}
