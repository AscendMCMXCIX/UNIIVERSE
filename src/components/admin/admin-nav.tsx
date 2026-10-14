"use client";

import { ADMIN_LINKS } from "@/lib/nav";
import { SubNav } from "@/components/ui/sub-nav";

/** Tabs across the Admin pages this account may open (the server passes which ones). */
export function AdminNav({ allowed }: { allowed: string[] }) {
  return <SubNav label="Admin" items={ADMIN_LINKS.filter((l) => allowed.includes(l.href)).map(({ href, label, icon }) => ({ href, label, icon }))} />;
}
