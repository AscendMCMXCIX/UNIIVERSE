import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (auth.session) redirect("/team");
  const { next } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <div className="text-[10px] tracking-[0.35em] text-fg-subtle">PRIVATE</div>
        <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">UNIIVERSE</h1>
        <p className="mt-2 text-sm text-fg-muted">Sign in with your team account. No account yet? Ask the owner for an invite link.</p>
        <LoginForm next={next ?? "/team"} />
      </div>
    </main>
  );
}
