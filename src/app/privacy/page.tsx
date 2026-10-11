import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | thèque",
  description: "What thèque stores, what the browser extension sends, and who processes your data.",
};

const LAST_UPDATED = "2026-10-11";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-xl text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-4 py-10 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="ks-pointer-coarse-min-hit mb-8 inline-flex text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Back to thèque
      </Link>

      <article className="rounded-2xl border border-border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-9">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          thèque web app and browser extension
        </p>
        <h1 className="mt-3 font-heading text-4xl tracking-[0.02em] text-foreground sm:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>

        <div className="mt-8 space-y-8 text-base leading-7 text-muted-foreground">
          <p>
            thèque is a private library for links you want to read, watch, or try. Your library is
            yours alone: there are no public profiles, no sharing, and no ads. We do not sell your
            data.
          </p>

          <Section title="What we store">
            <ul className="list-disc space-y-1 pl-5">
              <li>Your account email and the sign-in method you use (GitHub, Google, or an email code).</li>
              <li>The links you save and the cards we build from them: title, cover, description, and details such as author or year.</li>
              <li>
                Your notes and verdicts. We encrypt them at rest with AES-256-GCM before they reach
                the database.
              </li>
              <li>Your ratings, statuses, and the dates you mark things done.</li>
              <li>The recommendations we showed you and what you did with them.</li>
              <li>Book files, for the few accounts that have the Kobo feature.</li>
              <li>Capture tokens for the extension. We store only a hash of each token.</li>
            </ul>
          </Section>

          <Section title="What the browser extension sends">
            <p>
              The extension sends data only when you click “Save to thèque”. It does not watch your
              browsing in the background. When you click Save, it sends:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>The page URL and the page title.</li>
              <li>The page meta tags and structured data (for example schema.org JSON-LD).</li>
              <li>Up to 8 KB of the visible text on the page.</li>
              <li>Your optional note and shelf hint.</li>
            </ul>
            <p>
              We use this page content to build the card, so a page that blocks our server can
              still get a title and a cover. The extension keeps its capture token in browser
              storage so you do not need to connect it again for each save. Browsers do not let
              the extension read some pages, such as chrome:// pages.
            </p>
          </Section>

          <Section title="Who processes your data">
            <ul className="list-disc space-y-1 pl-5">
              <li>Supabase: the database, sign-in, and cover image storage.</li>
              <li>Vercel: hosting, privacy-friendly page analytics, and the AI Gateway.</li>
              <li>
                AI model providers (Anthropic, Google, and OpenAI) through the Vercel AI Gateway.
                They receive page content to fill in missing card details, and your titles and
                ratings when you ask for recommendations.
              </li>
              <li>
                Metadata lookups: TMDB, Open Library, Google Books, Hardcover, and YouTube oEmbed.
                They receive a title, an author, or a URL, never your notes.
              </li>
              <li>Cloudflare Turnstile: a bot check when you ask for an email code.</li>
              <li>Upstash: rate limits, keyed by your account id.</li>
              <li>Resend: email delivery.</li>
              <li>Google Drive: storage for book files on the Kobo feature.</li>
            </ul>
          </Section>

          <Section title="Deleting your data">
            <p>
              Settings → Danger zone deletes your account. It deletes your items, covers, book
              files, capture tokens, and recommendation history. The deletion is permanent.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions or support, write to{" "}
              <a className="underline underline-offset-4 hover:text-foreground" href="mailto:hello@theque.app">
                hello@theque.app
              </a>
              .
            </p>
          </Section>
        </div>
      </article>
    </main>
  );
}
