"use client";

import { PageError } from "@/components/ui/page-error";

/** An Admin Mode page that threw: shown inside Admin Mode's shell, with a way back to its dashboard. */
export default function AdminError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} back={{ href: "/admin", label: "Go to the Dashboard" }} />;
}
