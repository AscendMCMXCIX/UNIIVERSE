import { redirect } from "next/navigation";

/** The old Players & Accounts address: Users & Permissions → Accounts. */
export default function OldPlayersAdminRedirect() {
  redirect("/admin/people");
}
