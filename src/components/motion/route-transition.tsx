"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * A page's content settles in with a short fade + rise on navigation (`animate-fade-up`, motion.css) — the same
 * touch professional dashboards use so a route change reads as "the new page arrived" instead of an abrupt swap.
 * Keying on the pathname alone (not search params) is deliberate: filtering, paging and tab switches within one
 * route change `?query` only and must NOT remount — that would drop client-side state (an open dialog, the AI
 * Coach's in-flight message) for no reason. A real navigation to a different route is exactly when React would
 * remount the page's own components anyway; this only adds the animation on top of that.
 */
export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-up">
      {children}
    </div>
  );
}
