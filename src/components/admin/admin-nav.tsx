"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_LINKS, isActivePath } from "@/components/nav-links";
import { cn } from "@/lib/cn";

/** Horizontal tabs across the Admin pages, so the area is navigable even when the sidebar shows the Player View. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-border">
        {ADMIN_LINKS.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm md:min-h-9", active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
