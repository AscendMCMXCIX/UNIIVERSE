import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { firstAdminPath } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  redirect(firstAdminPath(await getSession()));
}
