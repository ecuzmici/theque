import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/library" className="font-serif text-lg tracking-tight">
            Keepswell
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/search" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
              Search
            </Link>
            <Link href="/add" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
              Add
            </Link>
            <Link href="/settings" className="text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
              Settings
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
