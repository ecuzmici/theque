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
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        compact && "min-w-[4.5rem] flex-col gap-1 px-2 py-1.5 text-[11px]",
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
            <Link href="/library" className="font-serif text-xl tracking-tight text-foreground">
              Theque
            </Link>
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
          <Link href="/library" className="font-serif text-lg tracking-tight text-foreground">
            Theque
          </Link>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(var(--ks-nav-height)+1rem)] pt-6 lg:pb-10">
          {children}
        </main>

        <nav
          className="fixed bottom-0 left-0 right-0 z-30 grid h-[var(--ks-nav-height)] grid-cols-5 items-end gap-x-1.5 border-t border-border bg-card/95 px-2 pb-2 backdrop-blur lg:hidden"
          aria-label="Primary"
        >
          {nav.slice(0, 2).map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.match(pathname)}
              compact
            />
          ))}
          <div className="flex justify-center pb-1">
            <Link
              href="/add"
              className={cn(
                "flex size-12 -translate-y-2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-4 ring-background transition hover:opacity-90",
                onAdd && "ring-accent",
              )}
              aria-label="Add link"
              aria-current={onAdd ? "page" : undefined}
            >
              <Plus className="size-6" />
            </Link>
          </div>
          {nav.slice(2).map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={item.match(pathname)}
              compact
            />
          ))}
        </nav>
      </div>
    </div>
  );
}
