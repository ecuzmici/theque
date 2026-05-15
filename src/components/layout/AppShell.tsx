import Link from "next/link";

const nav = [
  { href: "/library", label: "Library", short: "Lib" },
  { href: "/search", label: "Search", short: "Find" },
  { href: "/add", label: "Add", short: "Add" },
  { href: "/settings", label: "Settings", short: "Set" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="hidden border-[color:var(--ks-border)] bg-[color:var(--ks-bg-muted)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-52 lg:shrink-0 lg:flex-col lg:border-r lg:px-4 lg:py-6">
        <Link href="/library" className="font-serif text-xl tracking-tight text-[color:var(--ks-fg)]">
          Keepswell
        </Link>
        <p className="mt-1 text-xs text-[color:var(--ks-fg-muted)]">Your taste library</p>
        <nav className="mt-10 flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[color:var(--ks-fg-muted)] transition hover:bg-[color:var(--ks-surface)] hover:text-[color:var(--ks-fg)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[color:var(--ks-border)] bg-[color:var(--ks-bg)]/90 backdrop-blur lg:hidden">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/library" className="font-serif text-lg tracking-tight">
              Keepswell
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(var(--ks-nav-height)+1rem)] pt-6 lg:pb-10">
          {children}
        </main>

        <nav
          className="fixed bottom-0 left-0 right-0 z-30 flex h-[var(--ks-nav-height)] items-center justify-around border-t border-[color:var(--ks-border)] bg-[color:var(--ks-surface)]/95 backdrop-blur lg:hidden"
          aria-label="Primary"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-[4rem] flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-[color:var(--ks-fg-muted)] active:text-[color:var(--ks-accent)]"
            >
              <span className="text-sm font-semibold">{item.short}</span>
              <span className="opacity-80">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
