import type { Metadata } from "next";
import Link from "next/link";
import { Check, Puzzle, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/blahodpkabcnliljldelkoggeemfgdak";
const SUPPORT_EMAIL = "ecuzmici@gmail.com";

export const metadata: Metadata = {
  title: "A private, visual Pocket alternative | thèque",
  description:
    "Pocket shut down in 2025. thèque is a private, visual home for the things you save. Every link becomes a card on a shelf. No feed, no ads. Free.",
  alternates: { canonical: "/pocket-alternative" },
  openGraph: {
    type: "website",
    url: "https://theque.app/pocket-alternative",
    title: "thèque: a private, visual Pocket alternative",
    description:
      "Pocket is gone. thèque turns the links you save into a private library of cards on shelves, not a text list. No feed, no ads. Free.",
  },
};

const COMPARISON = [
  { feature: "What a save looks like", pocket: "A text list entry", theque: "A visual card with cover art" },
  { feature: "Organization", pocket: "Tags you add by hand", theque: "Auto-sorted onto shelves" },
  { feature: "Feed / recommendations", pocket: "Sponsored discover feed", theque: "None, it's just your library" },
  { feature: "Ads", pocket: "Yes", theque: "Never" },
  { feature: "Privacy", pocket: "Browsing fed recommendations", theque: "Private by design" },
  { feature: "Capture", pocket: "Extension / share", theque: "One click, Chrome or phone" },
  { feature: "Price", pocket: "Freemium → discontinued", theque: "Free" },
] as const;

const FAQ = [
  {
    q: "Is Pocket really gone?",
    a: "Yes, Mozilla shut Pocket down in 2025. If you were a Pocket user looking for a new home for your saves, thèque is a private, visual place to keep them.",
  },
  {
    q: "Can I import my Pocket saves?",
    a: "There's no one-click Pocket importer yet. For now you can paste any URL into thèque to save it, or use the Chrome extension to re-save pages as you revisit them.",
  },
  {
    q: "Is thèque free?",
    a: "Yes, free while it grows. Sign in with your email. No password, no credit card.",
  },
  {
    q: "How is it different from a read-later app?",
    a: "Read-later apps store a URL and a title. thèque reads the page and builds a card with cover, author, rating, and price, then files it on a shelf (Books, Watch, Articles, and an Other shelf for restaurants, products, travel, and recipes). It's a library you browse, not a queue you forget.",
  },
] as const;

export default function PocketAlternativePage() {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-16 px-4 py-12 sm:px-6 sm:py-20">
        {/* Hero */}
        <section className="flex flex-col items-center text-center">
          <p className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
            Pocket alternative
          </p>
          <h1 className="mt-6 max-w-2xl font-heading text-4xl tracking-[0.02em] text-foreground sm:text-5xl">
            Pocket is gone. Give your saves a prettier home.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            thèque is a private, visual library for everything you save. Each link becomes a card on
            a shelf (books, films, places, recipes, products), not a text list you forget. No feed,
            no ads, no algorithm.
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
          <p className="mt-3 text-xs text-muted-foreground">Free · No passwords · Private by design</p>
        </section>

        {/* Library screenshot */}
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <img
            src="/landing-library.png"
            width={1280}
            height={800}
            alt="A thèque library shown as a grid of book and film cover cards across shelves."
            className="h-auto w-full"
          />
        </div>

        {/* Comparison */}
        <section aria-labelledby="compare-heading" className="w-full">
          <h2
            id="compare-heading"
            className="text-center font-heading text-2xl tracking-[0.02em] text-foreground sm:text-3xl"
          >
            thèque vs. Pocket
          </h2>
          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground" scope="col">
                    {""}
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground" scope="col">
                    Pocket
                  </th>
                  <th className="px-4 py-3 font-medium text-foreground" scope="col">
                    thèque
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(({ feature, pocket, theque }) => (
                  <tr key={feature} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal text-foreground">
                      {feature}
                    </th>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <span className="flex items-start gap-2">
                        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                        {pocket}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-foreground">
                      <span className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden />
                        {theque}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <section className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <h2 className="font-heading text-2xl tracking-[0.02em] text-foreground">
            Move your saves somewhere beautiful
          </h2>
          <Button
            nativeButton={false}
            render={<Link href="/login" />}
            size="lg"
            className="h-11 min-h-11 w-full px-6 text-base sm:w-auto"
          >
            Start your library for free
          </Button>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} thèque</p>
          <nav className="flex items-center gap-4" aria-label="Footer">
            <Link href="/" className="hover:text-foreground hover:underline underline-offset-4">
              Home
            </Link>
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
