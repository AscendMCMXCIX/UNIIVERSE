import Link from "next/link";
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
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Recover the owner account</h1>
      <p className="mt-2 text-sm text-fg-muted">UNIIVERSE signs in with a username and password only; there is no email login. Accounts created before usernames existed were given their former display name as username. If you do not know the owner username or password, the setup key proves you own this deployment.</p>
      {configured ? (
        <RecoverForm />
      ) : (
        <div className="mt-4 space-y-2 text-sm text-fg-muted">
          <p>The setup key is not configured, so recovery cannot run yet. Add it in your hosting environment and redeploy, then return here:</p>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-bg-elevated p-3 text-xs">UNIIVERSE_ACCESS_PASSWORD=a-long-random-string-only-you-know</pre>
          <p className="text-xs text-fg-subtle">On Vercel: Project → Settings → Environment Variables (Production), then Deployments → ⋯ → Redeploy.</p>
        </div>
      )}
      <p className="mt-4 text-xs text-fg-subtle">
        Team members who forgot their password ask the owner (Settings → Team members).{" "}
        <Link href="/login" className="text-accent underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </BrandFrame>
  );
}
