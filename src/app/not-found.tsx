import { PageNotFound } from "@/components/ui/page-error";

/** An address no page answers. Outside the app shell, so it says nothing about the team. */
export default function NotFound() {
  return <PageNotFound back={{ href: "/", label: "Go to the start page" }} />;
}
