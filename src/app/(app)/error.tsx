"use client";

import { PageError } from "@/components/ui/page-error";

/** A Player Mode page that threw: shown inside the app shell, with a way back to Team. */
export default function AppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} back={{ href: "/team", label: "Go to Team" }} />;
}
