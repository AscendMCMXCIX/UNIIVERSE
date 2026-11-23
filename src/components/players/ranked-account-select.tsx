"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";

/**
 * Ranked progress's account choice, with two or more linked accounts: one compact select beside the
 * queue switch (it was a second segmented group, which took a row of its own on a phone, out of line
 * with the switch: the owner's review of Release 13). Each account by its in-game name (with the
 * tagline only where two share a name), in the player's own order, the Main account first. A choice
 * replaces the page's address (`href`, worked out on the server), so Back leaves the profile as it
 * was, and the page stays where it is.
 */
export function RankedAccountSelect({ accounts, value, className }: { accounts: Array<{ id: string; label: string; href: string }>; value: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Select
      id="ranked-accounts"
      aria-label="Account"
      value={value}
      disabled={pending}
      aria-busy={pending}
      onValueChange={(id) => {
        const to = accounts.find((a) => a.id === id)?.href;
        if (to) start(() => router.replace(to, { scroll: false }));
      }}
      className={cn("w-auto min-w-[8rem] max-w-[12rem] flex-1", className)}
      options={accounts.map((a) => ({ value: a.id, label: a.label }))}
      data-testid="ranked-account-select"
    />
  );
}
