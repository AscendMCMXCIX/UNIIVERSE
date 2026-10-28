import { redirect } from "next/navigation";

/** Block history is the session history now. */
export default function OldBlockHistoryRedirect() {
  redirect("/overview/development/sessions");
}
