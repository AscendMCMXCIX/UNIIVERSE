import { redirect } from "next/navigation";

export default function OldBlockHistoryRedirect() {
  redirect("/overview/blocks/history");
}
