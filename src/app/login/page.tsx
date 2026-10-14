import { redirect } from "next/navigation";
import { getAuthState } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { LoginCard } from "./login-card";
import { BrandFrame } from "@/components/auth/brand-frame";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const db = await getAppDb();
  const auth = await getAuthState(db);
  if (auth.mode === "locked" || auth.mode === "setup") redirect("/setup");
  if (auth.session) redirect("/");
  const { next } = await searchParams;
  return (
    <BrandFrame eyebrow="PRIVATE">
      <LoginCard next={next ?? ""} />
    </BrandFrame>
  );
}
