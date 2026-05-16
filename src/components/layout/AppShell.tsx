"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  LayoutGrid,
  Plus,
  Search,
  Settings,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ThequeLogo } from "@/components/brand/ThequeLogo";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/library", label: "Library", icon: LayoutGrid, match: (p: string) => p === "/library" || p.startsWith("/library") },
  { href: "/collections", label: "Collections", icon: FolderOpen, match: (p: string) => p.startsWith("/collections") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p === "/search" },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p === "/settings" },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  compact,
}: {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : compact
            ? "text-muted-foreground hover:bg-muted hover:text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground dark:hover:bg-white/10",
        compact &&
          "max-w-full flex-col gap-1 px-1 py-2 text-[11px] w-full min-h-11 items-center justify-center text-center leading-tight",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className={cn("size-4 shrink-0", compact && "size-5")} aria-hidden />
      <span className={compact ? "leading-none" : undefined}>{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onAdd = pathname === "/add";

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="hidden border-r border-border bg-sidebar lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-56 lg:shrink-0 lg:flex-col lg:px-4 lg:py-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <ThequeLogo size="lg" href="/library" />
            <p className="mt-1 text-xs text-muted-foreground">Your taste library</p>
          </div>
          <ThemeToggle />
        </div>

        <nav className="mt-10 flex flex-col gap-1" aria-label="Primary">
          {nav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.match(pathname)}
            />
          ))}
        </nav>

        <div className="mt-auto pt-8">
          <Link
            href="/add"
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90",
              onAdd && "ring-2 ring-ring",
            )}
          >
            <Plus className="size-4" aria-hidden />
            Add link
          </Link>
        </div>
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur lg:hidden">
          <ThequeLogo size="md" href="/library" />
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(var(--ks-nav-height)+1rem)] pt-6 lg:pb-10">
          {children}
        </main>

        <nav
          className={cn(
            "fixed bottom-0 left-0 right-0 z-30 flex h-[var(--ks-nav-height)] items-end border-t border-border bg-card/95 backdrop-blur lg:hidden",
            "px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5",
          )}
          aria-label="Primary"
        >
          {nav.slice(0, 2).map((item) => (
            <div key={item.href} className="flex min-w-0 flex-1 justify-center">
              <NavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={item.match(pathname)}
                compact
              />
            </div>
          ))}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-end pb-0.5">
            <Link
              href="/add"
              className={cn(
                "flex size-12 shrink-0 -translate-y-1.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-background transition hover:opacity-90",
                onAdd && "ring-accent",
              )}
              aria-label="Add link"
              aria-current={onAdd ? "page" : undefined}
            >
              <Plus className="size-6" />
            </Link>
          </div>
          {nav.slice(2).map((item) => (
            <div key={item.href} className="flex min-w-0 flex-1 justify-center">
              <NavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={item.match(pathname)}
                compact
              />
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
