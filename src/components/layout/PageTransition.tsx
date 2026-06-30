"use client";

import { usePathname } from "next/navigation";

/**
 * Replays a gentle fade+rise each time the route (pathname) changes, so moving
 * between Library / item detail / Add / Search / Settings feels calm rather than
 * abrupt.
 *
 * Keyed by `pathname` only — query-string changes (the library's
 * `?shelf=…` swaps, search's `?q=…`) keep the same key, so they do NOT remount
 * the page or blow away the library's in-memory shelf cache. Shelf swaps get
 * their own lighter fade inside the library. Reduced-motion users get no
 * animation (see `.ks-page-enter` in globals.css).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="ks-page-enter">
      {children}
    </div>
  );
}
