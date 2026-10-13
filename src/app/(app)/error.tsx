"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Route-level fallback inside the app shell: a page that throws shows what happened and offers
 * to try again, instead of a blank screen. Navigation and the rest of the app stay usable.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-10">
      <h1 className="text-lg font-bold">This page hit a problem</h1>
      <p className="text-sm text-fg-muted">{process.env.NODE_ENV !== "production" ? error.message : "Something went wrong while loading this page. It has been logged; nothing you entered was lost unless it was mid-save."}</p>
      {error.digest ? <p className="font-mono text-[11px] text-fg-subtle">reference {error.digest}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href="/team">
          <Button variant="outline">Go to Team</Button>
        </Link>
      </div>
    </div>
  );
}
