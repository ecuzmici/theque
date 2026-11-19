"use client";

import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { LAB_IDEAS } from "./ideas";

export function LabNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Lab prototypes" className="-mx-4 mb-6 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex w-max gap-1.5 py-1">
        <li>
          <Link
            href="/lab"
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 font-mono text-[11px] uppercase tracking-widest",
              pathname === "/lab"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Lab
          </Link>
        </li>
        {LAB_IDEAS.map((idea) => {
          const active = pathname === `/lab/${idea.slug}`;
          return (
            <li key={idea.slug}>
              <Link
                href={`/lab/${idea.slug}`}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full border px-3 text-xs",
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {idea.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
