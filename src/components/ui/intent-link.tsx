"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/*
  A link to a member's profile that prefetches on intent, not on sight (PLAN S8a, HOSTING_USAGE
  "Not changed here"): the page is fetched ahead only once a pointer rests on the link, a finger
  touches it or the keyboard reaches it, never because it scrolled into view. Seen-not-touched
  links were about 30% of a member's visit (each prefetch is a server render); the cost is that a
  link nobody pointed at opens a little slower. Everything else is Next's Link.
*/

export function IntentLink({ href, onPointerEnter, onTouchStart, onFocus, ...rest }: Omit<React.ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string }) {
  const router = useRouter();
  const done = React.useRef(false);
  const warm = () => {
    if (done.current) return;
    done.current = true;
    router.prefetch(href);
  };
  return (
    <Link
      href={href}
      prefetch={false}
      onPointerEnter={(e) => {
        warm();
        onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      data-prefetch="intent"
      {...rest}
    />
  );
}
