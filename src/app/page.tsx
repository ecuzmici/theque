import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bookmark,
  FolderHeart,
  Puzzle,
  Search,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak";
const SUPPORT_EMAIL = "ecuzmici@gmail.com";

const STEPS = [
  {
    icon: Bookmark,
    title: "Save in one click",
    detail: "Hit the thèque button on any page, from Chrome or your phone. No forms, no copy-paste.",
  },
  {
    icon: WandSparkles,
    title: "It builds the card",
    detail: "thèque reads the page and fills in the cover, title, author or director, rating, and price.",
  },
  {
    icon: FolderHeart,
    title: "It finds its shelf",
    detail: "Every save sorts itself by what it is, and you can group anything into collections.",
  },
] as const;

const SHELVES = [
  "Books",
  "Watch",
  "Listen",
  "Eat",
  "Shop",
  "Travel",
  "Read",
  "Cook",
  "Tools",
] as const;

const VALUES = [
  { icon: Bookmark, label: "One-tap save", detail: "from Chrome or your phone" },
  { icon: WandSparkles, label: "Auto-enriched cards", detail: "covers, authors, ratings" },
  { icon: Search, label: "Browse by taste", detail: "shelves, search, collections" },
  { icon: FolderHeart, label: "Only yours", detail: "private, no feeds, no likes" },
] as const;

const FAQ = [
  {
    q: "How is this different from bookmarks or Pocket?",
    a: "Bookmarks store a URL and a title. thèque reads the page and builds a visual card with cover art, author, rating, and price, then files it on the right shelf. It's a library you'll actually want to browse, not a list you forget.",
  },
  {
    q: "Is it really private?",
    a: "Yes. thèque is your personal library. There's no feed, no likes, no algorithm, and no ads. The extension only saves a page when you click it, and it never tracks your browsing or sells your data.",
  },
  {
    q: "Does it cost anything?",
    a: "No. thèque is free to use while it's growing. Sign in with your email and start saving.",
  },
  {
    q: "Do I need the Chrome extension?",
    a: "It's the fastest way to save, but you don't have to use it. You can paste any URL into thèque directly, or save from your phone.",
  },
] as const;

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/library");
  }

  return (
    <div className="flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-16 px-4 py-12 sm:px-6 sm:py-20">
        {/* Hero */}
        <section aria-labelledby="home-heading" className="flex flex-col items-center text-center">
          <p className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
            <Sparkles className="size-3.5 shrink-0 text-accent-foreground" aria-hidden />
            Private taste library
          </p>
          <h1
            id="home-heading"
            className="mt-6 font-serif text-5xl lowercase tracking-[0.04em] text-foreground sm:text-6xl"
          >
            thèque
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            Save books, films, places, and anything else worth a second look. Each link becomes a
            card on a shelf. A library of your taste, not a pile of dead bookmarks.
          </p>

          <div className="mt-8 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              size="lg"
              className="h-11 min-h-11 w-full px-6 text-base sm:w-auto"
            >
              Start your library
            </Button>
            <Button
              nativeButton={false}
              render={<a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" />}
              size="lg"
              variant="outline"
              className="h-11 min-h-11 w-full gap-2 px-6 text-base sm:w-auto"
            >
              <Puzzle className="size-4" aria-hidden />
              Add to Chrome
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Free · No passwords, just an emailed sign-in code · Private by design
          </p>
        </section>

        {/* Real library screenshot: the promise of what's inside */}
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <img
            src="/landing-library.png"
            width={1280}
            height={800}
            alt="A thèque library shown as a grid of book and film cover cards across shelves."
            className="h-auto w-full"
          />
        </div>

        {/* How it works */}
        <section aria-labelledby="how-heading" className="w-full">
          <h2
            id="how-heading"
            className="text-center font-heading text-2xl tracking-[0.02em] text-foreground sm:text-3xl"
          >
            From a link to a library, automatically
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, detail }, i) => (
              <li
                key={title}
                className="rounded-2xl border border-border bg-card px-5 py-5 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-sm font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                  <Icon className="size-5 text-accent-foreground" aria-hidden />
                </div>
                <p className="mt-3 font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Shelves */}
        <section aria-labelledby="shelves-heading" className="w-full text-center">
          <h2
            id="shelves-heading"
            className="font-heading text-2xl tracking-[0.02em] text-foreground sm:text-3xl"
          >
            A shelf for everything you save
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Saves sort themselves onto image-forward shelves. Group anything into collections for
            trips, projects, and gift lists.
          </p>
          <ul className="mx-auto mt-6 flex max-w-xl flex-wrap justify-center gap-2">
            {SHELVES.map((shelf) => (
              <li
                key={shelf}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm text-foreground shadow-sm"
              >
                {shelf}
              </li>
            ))}
          </ul>
        </section>

        {/* Values */}
        <section aria-label="Why thèque" className="w-full">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, label, detail }) => (
              <li key={label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <Icon className="size-4 text-accent-foreground" aria-hidden />
                <p className="mt-2 text-sm font-medium text-foreground">{label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading" className="w-full max-w-2xl">
          <h2
            id="faq-heading"
            className="text-center font-heading text-2xl tracking-[0.02em] text-foreground sm:text-3xl"
          >
            Questions
          </h2>
          <div className="mt-6 space-y-3">
            {FAQ.map(({ q, a }) => (
              <details
                key={q}
                className="group rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
              >
                <summary className="ks-pointer-coarse-min-hit flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-foreground marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                  {q}
                  <span
                    aria-hidden
                    className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="flex w-full max-w-md flex-col items-center gap-3 text-center">
          <h2 className="font-heading text-2xl tracking-[0.02em] text-foreground">
            Start saving what you love
          </h2>
          <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              nativeButton={false}
              render={<Link href="/login" />}
              size="lg"
              className="h-11 min-h-11 w-full px-6 text-base sm:w-auto"
            >
              Start your library
            </Button>
            <Button
              nativeButton={false}
              render={<a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" />}
              size="lg"
              variant="outline"
              className="h-11 min-h-11 w-full gap-2 px-6 text-base sm:w-auto"
            >
              <Puzzle className="size-4" aria-hidden />
              Add to Chrome
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} thèque</p>
          <nav className="flex items-center gap-4" aria-label="Footer">
            <Link href="/privacy" className="hover:text-foreground hover:underline underline-offset-4">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground hover:underline underline-offset-4">
              Terms
            </Link>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="hover:text-foreground hover:underline underline-offset-4"
            >
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
