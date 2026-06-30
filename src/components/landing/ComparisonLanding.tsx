import Link from "next/link";
import { Check, Puzzle, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CHROME_STORE_URL } from "@/lib/extension-identity";
import type { ComparisonPageConfig } from "@/lib/landing/comparison-pages";

const SUPPORT_EMAIL = "hello@theque.app";

/**
 * Data-driven marketing/SEO landing page, sharing the look of `/pocket-alternative`.
 * Server component (no client JS); content comes from a `ComparisonPageConfig`.
 */
export function ComparisonLanding({ config }: { config: ComparisonPageConfig }) {
  const { eyebrow, headline, intro, competitorName, comparisonHeading, comparison, points, faq, finalCtaHeading } =
    config;

  return (
    <div className="flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-16 px-4 py-12 sm:px-6 sm:py-20">
        {/* Hero */}
        <section className="flex flex-col items-center text-center">
          <p className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:text-sm">
            {eyebrow}
          </p>
          <h1 className="mt-6 max-w-2xl font-heading text-4xl tracking-[0.02em] text-foreground sm:text-5xl">
            {headline}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{intro}</p>
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

        {/* Value points */}
        <section aria-label="How it works" className="grid w-full gap-4 sm:grid-cols-3">
          {points.map(({ title, detail }) => (
            <div key={title} className="rounded-2xl border border-border bg-card px-5 py-5 shadow-sm">
              <h2 className="font-heading text-lg tracking-[0.02em] text-foreground">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p>
            </div>
          ))}
        </section>

        {/* Comparison */}
        <section aria-labelledby="compare-heading" className="w-full">
          <h2
            id="compare-heading"
            className="text-center font-heading text-2xl tracking-[0.02em] text-foreground sm:text-3xl"
          >
            {comparisonHeading}
          </h2>
          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-medium text-muted-foreground" scope="col">
                    {""}
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground" scope="col">
                    {competitorName}
                  </th>
                  <th className="px-4 py-3 font-medium text-foreground" scope="col">
                    thèque
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparison.map(({ feature, them, us }) => (
                  <tr key={feature} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-normal text-foreground">
                      {feature}
                    </th>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <span className="flex items-start gap-2">
                        <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                        {them}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-foreground">
                      <span className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-accent-foreground" aria-hidden />
                        {us}
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
            {faq.map(({ q, a }) => (
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
          <h2 className="font-heading text-2xl tracking-[0.02em] text-foreground">{finalCtaHeading}</h2>
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
