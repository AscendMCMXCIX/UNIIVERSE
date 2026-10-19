import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getPublicAccess } from "@/server/public/access";
import { LoginCard } from "./login-card";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";

/**
 * Sign in. Signed in already, the page only opens to add another account (`?add=1`, from the
 * account menu): signing in then keeps the current account signed in on this browser too.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; add?: string }> }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  const { next, add } = await searchParams;
  const adding = add === "1" && !!auth.session;
  if (auth.session && !adding) redirect("/");
  return (
    <BrandFrame eyebrow="PRIVATE">
      {adding ? (
        <>
          <LoginCard next={next ?? ""} add current={auth.session!.username ?? auth.session!.label} />
          <Link href="/" className="mt-4 block text-center text-sm text-fg-muted hover:text-fg" data-testid="add-account-cancel">
            Cancel
          </Link>
        </>
      ) : (
        <>
          <LoginCard next={next ?? ""} />
          {(await getPublicAccess(db)).enabled ? (
            <Link href="/public" className="mt-4 block text-center text-sm text-fg-muted hover:text-fg" data-testid="login-public-link">
              View the team page →
            </Link>
          ) : null}
        </>
      )}
    </BrandFrame>
  );
}
