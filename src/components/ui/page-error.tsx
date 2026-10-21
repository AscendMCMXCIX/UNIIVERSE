"use client";

import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";

/**
 * A page that threw (a route group's `error.tsx`): what happened, Try again, and a way back, inside
 * the app's shell, so navigation and the rest of the app stay usable instead of a blank screen.
 */
export function PageError({ error, reset, back }: { error: Error & { digest?: string }; reset: () => void; back: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 py-10" data-testid="page-error">
      <h1 className="text-lg font-bold">This page hit a problem</h1>
      <p className="text-sm text-fg-muted">{process.env.NODE_ENV !== "production" ? error.message : "Something went wrong while loading this page. It has been logged; nothing you entered was lost unless it was mid-save."}</p>
      {error.digest ? <p className="font-mono text-xs text-fg-subtle">reference {error.digest}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" onClick={reset}>
          Try again
        </Button>
        <Link href={back.href} className={buttonClass("outline")}>
          {back.label}
        </Link>
      </div>
    </div>
  );
}

/** A page that does not exist (a `not-found.tsx`): said plainly, with a way back. */
export function PageNotFound({ back }: { back: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-xl space-y-3 px-4 py-10" data-testid="not-found">
      <h1 className="text-lg font-bold">This page does not exist</h1>
      <p className="text-sm text-fg-muted">It may have been removed, or the address is mistyped.</p>
      <Link href={back.href} className={buttonClass("outline")}>
        {back.label}
      </Link>
    </div>
  );
}
