import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { LoginForm } from "./login-form";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (auth.session) redirect("/team");
  const { next } = await searchParams;
  return (
    <BrandFrame eyebrow="PRIVATE">
      <h1 className="mt-1 text-xl font-bold tracking-[0.2em]">Sign in</h1>
      <p className="mt-2 text-sm text-fg-muted">Use the username and activation code from your admin. There is no sign-up: admins create every account.</p>
      <LoginForm next={next ?? "/team"} />
    </BrandFrame>
  );
}
