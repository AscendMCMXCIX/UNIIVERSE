import { redirect } from "next/navigation";

/** The public team page has no switch any more (it is always on): the old Admin address opens it. */
export default function AdminPublicAccessPage() {
  redirect("/public");
}
