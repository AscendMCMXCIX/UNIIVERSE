import { redirect } from "next/navigation";

/** The old Users address: Users & Permissions → Accounts (each person's access; Access levels for the definitions). */
export default function OldUsersAdminRedirect() {
  redirect("/admin/people");
}
