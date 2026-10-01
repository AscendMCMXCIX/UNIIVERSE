import { redirect } from "next/navigation";
import { authMode } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/** Shown in production when no password has been configured yet. */
export default function SetupPage() {
  if (authMode() !== "locked") redirect("/team");
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-bold tracking-[0.2em]">UNIIVERSE</h1>
        <h2 className="mt-3 text-base font-semibold">One step before the app can open</h2>
        <p className="mt-2 text-sm text-fg-muted">
          UNIIVERSE is private, and this deployment has no team password yet. Add the following environment variable in your hosting
          provider (on Vercel: Project → Settings → Environment Variables), then redeploy:
        </p>
        <pre className="mt-3 rounded-md border border-border bg-bg-elevated p-3 text-xs">UNIIVERSE_ACCESS_PASSWORD=choose-a-strong-password</pre>
        <p className="mt-3 text-sm text-fg-muted">
          Optional: <code className="text-fg">UNIIVERSE_VIEWER_PASSWORD</code> for read-only teammates and <code className="text-fg">UNIIVERSE_AUTH_SECRET</code> (any long random string) to sign sessions.
        </p>
      </div>
    </main>
  );
}
