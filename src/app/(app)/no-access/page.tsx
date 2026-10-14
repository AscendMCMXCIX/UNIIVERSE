import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { getSession } from "@/server/auth/session";
import { NAV_LINKS, canOpen } from "@/lib/nav";

export const dynamic = "force-dynamic";

/** Shown when a page is outside this account's permissions: lists the pages it can open. */
export default async function NoAccessPage() {
  const session = await getSession();
  const open = NAV_LINKS.filter((l) => canOpen(session, l));
  return (
    <div className="mx-auto mt-10 max-w-md space-y-4 text-center">
      <ShieldOff className="mx-auto h-10 w-10 text-fg-subtle" aria-hidden />
      <h1 className="text-xl font-semibold">You don&apos;t have access to that page</h1>
      <p className="text-sm text-fg-muted">An admin chooses what each account can use. Ask them if you think you should see it.</p>
      <div className="flex flex-wrap justify-center gap-2">
        {open.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface">
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
