import { redirect } from "next/navigation";
import { getAuthState, isProductionDeployment, missingProductionSetup } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

/** First-run page: explains missing production configuration, or creates the owner account. */
export default async function SetupPage() {
  const missing = missingProductionSetup();
  if (missing.length > 0) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-bold tracking-[0.2em]">UNIIVERSE</h1>
          <h2 className="mt-3 text-base font-semibold">One step before the app can open</h2>
          <p className="mt-2 text-sm text-fg-muted">This production deployment is missing required settings. Add them in your hosting provider (on Vercel: Project → Settings → Environment Variables), then redeploy:</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-bg-elevated p-3 text-xs">
            {missing.includes("DATABASE_URL") ? "DATABASE_URL=postgresql://…   (Supabase → Connect → Transaction pooler)\n" : ""}
            {missing.includes("UNIIVERSE_AUTH_SECRET") ? "UNIIVERSE_AUTH_SECRET=any-long-random-string\nUNIIVERSE_ACCESS_PASSWORD=setup-key-used-once-to-create-the-owner" : ""}
          </pre>
        </div>
      </main>
    );
  }
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode !== "setup" && auth.mode !== "open") redirect("/login");
  if (auth.session && auth.mode === "open") redirect("/team");
  if (isProductionDeployment() && !process.env.UNIIVERSE_ACCESS_PASSWORD) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-bold tracking-[0.2em]">UNIIVERSE</h1>
          <h2 className="mt-3 text-base font-semibold">Set the setup key first</h2>
          <p className="mt-2 text-sm text-fg-muted">The owner account can only be created with a setup key, so that nobody else can claim this deployment before you do. Add it in your hosting provider (on Vercel: Project → Settings → Environment Variables), redeploy, then return here:</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-md border border-border bg-bg-elevated p-3 text-xs">UNIIVERSE_ACCESS_PASSWORD=a-long-random-string-you-will-type-once</pre>
        </div>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <div className="text-[10px] tracking-[0.35em] text-fg-subtle">FIRST RUN</div>
        <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">UNIIVERSE</h1>
        <p className="mt-2 text-sm text-fg-muted">Create the owner account. You will invite teammates from Settings afterwards.</p>
        <SetupForm needsKey={isProductionDeployment()} />
      </div>
    </main>
  );
}
