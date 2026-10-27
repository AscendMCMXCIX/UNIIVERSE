"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs a Ranked Development action: busy while it runs, the error as a toast when it fails, and a
 * server refresh when it succeeds, so the page shows what changed (the open window stays open).
 * Resolves to { data } on success and null on failure.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(
    async <T,>(fn: () => Promise<ActionResult<T>>, options: { success?: string | ((data: T) => string); failure?: string } = {}): Promise<{ data: T } | null> => {
      setBusy(true);
      try {
        const res = await fn();
        if (!res.ok) {
          toast.error(options.failure ?? "That did not work", { description: res.error });
          return null;
        }
        if (options.success) toast.success(typeof options.success === "function" ? options.success(res.data) : options.success);
        router.refresh();
        return { data: res.data };
      } catch {
        toast.error(options.failure ?? "That did not work", { description: "The connection dropped. Nothing was lost; please try again." });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );
  return { busy, run };
}
