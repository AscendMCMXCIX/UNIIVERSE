"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { ADMIN_LINKS, NAV_LINKS, isActivePath } from "@/lib/nav";

export { ADMIN_LINKS, NAV_LINKS, isActivePath, canOpen, firstAdminPath, type NavLink } from "@/lib/nav";

/**
 * Vertical navigation list: the desktop sidebar and the phone/tablet drawer share it. The server
 * decides which pages this account may open and passes their paths (`allowed`); icons stay here.
 */
export function NavLinks({ allowed, admin = false, onNavigate, large = false }: { allowed: string[]; admin?: boolean; onNavigate?: () => void; large?: boolean }) {
  const pathname = usePathname();
  const links = (admin ? ADMIN_LINKS : NAV_LINKS).filter((l) => allowed.includes(l.href));
  return (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {links.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
              large ? "min-h-12 py-2" : "min-h-10 py-2",
              active ? "bg-accent/10 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <span className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors", active ? "bg-accent" : "bg-transparent")} aria-hidden />
            <Icon className={cn("h-[18px] w-[18px] transition-colors", active ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
