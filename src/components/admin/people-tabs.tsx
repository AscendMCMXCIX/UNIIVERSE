"use client";

import { Fingerprint, ShieldCheck, Users } from "lucide-react";
import { SubNav } from "@/components/ui/sub-nav";

/**
 * Users & Permissions' pages. With a larger text size on a phone (the row under 13.5rem: 18rem and
 * up at the usual size), a label too long for the line ("Access levels & groups") wraps inside its
 * tab rather than widening the page.
 */
export function PeopleTabs({ showAccess }: { showAccess: boolean }) {
  return (
    <div className="@container">
      <div className="@max-[13.5rem]:[&_a]:whitespace-normal @max-[13.5rem]:[&_a]:text-center">
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
      </div>
    </div>
  );
}
