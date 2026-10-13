"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Swords, UserCog, TrendingUp, Settings, History, Target, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/draft", label: "Draft", icon: Swords },
  { href: "/players", label: "Players", icon: UserCog },
  { href: "/matches", label: "Matches", icon: History },
  { href: "/ranked", label: "My Ranked", icon: Target },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Vertical navigation list: the desktop sidebar and the phone/tablet drawer share it. */
export function NavLinks({ onNavigate, large = false }: { onNavigate?: () => void; large?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2" aria-label="Main">
      {NAV_LINKS.map(({ href, label, icon: Icon }) => {
        const active = isActivePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
              large ? "min-h-11 py-2" : "py-2",
              active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-accent" : "text-fg-subtle")} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
