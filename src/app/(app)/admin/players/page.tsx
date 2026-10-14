import { redirect } from "next/navigation";

/** Players & Accounts is now People & Access → Accounts. */
export default function OldPlayersAdminRedirect() {
  redirect("/admin/people");
}
