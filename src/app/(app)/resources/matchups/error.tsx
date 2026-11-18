"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MATCHUP_INTEL_PATH } from "@/components/matchup-intel/address";
import { Button, buttonClass } from "@/components/ui/button";

/**
 * Matchup Intel when its page threw (the roster, the current patch or the stored abilities could
 * not be read, and nothing cached stood in): said for this page, inside the app's shell and the
 * Resources tabs, with Try again (the server's page read afresh, then shown) and Start again (the
 * page with no champions chosen). The app-wide boundary would offer Team instead.
 */
export default function MatchupIntelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl space-y-3 py-10" data-testid="matchup-intel-error">
      <h1 className="text-lg font-bold">Matchup Intel could not load</h1>
      <p className="text-sm text-fg-muted">{process.env.NODE_ENV !== "production" ? error.message : "Reading the champions or their abilities failed. It has been logged; nothing you chose was lost, and it is still in the address."}</p>
      {error.digest ? <p className="font-mono text-xs text-fg-subtle">reference {error.digest}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() =>
            // A server component's error: its page is read again before the boundary lets go.
            React.startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Try again
        </Button>
        <Link href={MATCHUP_INTEL_PATH} prefetch={false} className={buttonClass("outline")}>
          Start again
        </Link>
      </div>
    </div>
  );
}
