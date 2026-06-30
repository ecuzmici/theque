import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | thèque",
  description: "Privacy policy for the thèque browser extension and capture flow.",
};

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
          thèque Capture
        </p>
        <h1 className="mt-3 font-heading text-4xl tracking-[0.02em] text-foreground sm:text-5xl">
          Privacy Policy
        </h1>

        <div className="mt-8 space-y-5 text-base leading-7 text-muted-foreground">
          <p>
            thèque is a private personal library for saving and organizing links. The thèque browser
            extension helps you save the current browser tab to your own thèque library.
          </p>
          <p>
            The extension collects the active tab URL only when you explicitly click “Save to
            thèque”. You may also choose to add an optional note or shelf/category hint. This
            information is sent to your thèque account so it can be stored, enriched, and shown in
            your library.
          </p>
          <p>
            The extension stores a capture token locally in browser storage. This token is used only
            to authenticate capture requests to thèque, so you do not need to reconnect the
            extension every time you save a page.
          </p>
          <p>
            The extension does not monitor browsing activity in the background, does not sell
            personal data, does not serve ads, and does not share captured URLs with third-party
            advertising networks.
          </p>
          <p>
            Some browser pages, such as chrome:// pages or extension pages, cannot be captured
            because browsers restrict extension access to those pages.
          </p>
          <p>
            For questions or support, contact the site owner at hello@theque.app.
          </p>
        </div>
      </article>
    </main>
  );
}
