import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { canUseAdminArea } from "@/server/auth/permissions";

export const dynamic = "force-dynamic";

/**
 * The Admin area: the Owner account only (every page beneath also checks an owner-only
 * permission, and every admin action checks again on the server). Any other account is sent to
 * its own profile; Admin Mode never opens for it, whatever its capabilities or groups.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!canUseAdminArea(session)) redirect("/overview");
  return <div className="mx-auto w-full max-w-[var(--content-max)] space-y-5">{children}</div>;
}
