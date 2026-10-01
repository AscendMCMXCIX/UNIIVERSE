import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { authMode, getSession } from "@/server/auth/session";
import { getAppDb } from "@/server/bootstrap";
import { getShellStatus } from "@/server/ops/status";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const mode = authMode();
  if (mode === "locked") redirect("/setup");
  const session = await getSession();
  if (mode === "password" && !session) redirect("/login");
  const db = await getAppDb();
  const status = await getShellStatus(db);
  return <AppShell status={status}>{children}</AppShell>;
}
