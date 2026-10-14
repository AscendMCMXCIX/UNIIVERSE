import { redirect } from "next/navigation";

/** Users & Permissions is now People & Access (Accounts for each person's access, Access levels & groups for the definitions). */
export default function OldUsersAdminRedirect() {
  redirect("/admin/people");
}
