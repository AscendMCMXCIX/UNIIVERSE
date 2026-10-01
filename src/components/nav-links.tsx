"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Swords, UserCog, TrendingUp, Settings } from "lucide-react";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/team", label: "Team", icon: Users },
  { href: "/draft", label: "Draft", icon: Swords },
  { href: "/players", label: "Players", icon: UserCog },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
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
