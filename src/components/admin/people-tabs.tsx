"use client";

import { Fingerprint, ShieldCheck, Users } from "lucide-react";
import { SubNav } from "@/components/ui/sub-nav";

export function PeopleTabs({ showAccess }: { showAccess: boolean }) {
  return (
    <SubNav
      label="Users & Permissions"
      items={[
        { href: "/admin/people", label: "Accounts", icon: Users, exact: true },
        ...(showAccess
          ? [
              { href: "/admin/people/access", label: "Access levels & groups", icon: ShieldCheck },
              { href: "/admin/people/privacy", label: "Personal data", icon: Fingerprint },
            ]
          : []),
      ]}
    />
  );
}
