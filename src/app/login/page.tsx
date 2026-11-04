import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { LoginCard } from "./login-card";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";

/**
 * Sign in, as a page of its own: for direct links and members' pages asked for without a session
 * (the proxy sends them here with `next`). Everyday signing in happens in the public team page's
 * sign-in window, with the same form. One account per browser: signed in already, the page sends
 * you to your start page.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (auth.session) redirect("/");
  const { next } = await searchParams;
  return (
    <BrandFrame eyebrow="PRIVATE">
      <LoginCard next={next ?? ""} />
      <Link href="/public" className="mx-auto mt-3 flex min-h-8 w-fit items-center px-2 text-sm text-fg-muted hover:text-fg pointer-coarse:min-h-11" data-testid="login-public-link">
        View the team page →
      </Link>
      <Link href="/privacy" className="mx-auto flex min-h-8 w-fit items-center px-2 text-xs text-fg-subtle hover:text-fg pointer-coarse:min-h-11" data-testid="login-privacy-link">
        Privacy
      </Link>
    </BrandFrame>
  );
}
