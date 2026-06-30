import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | thèque",
  description: "The terms for using thèque, a private personal taste library.",
};

export default function TermsPage() {
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
          thèque
        </p>
        <h1 className="mt-3 font-heading text-4xl tracking-[0.02em] text-foreground sm:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">Last updated: June 18, 2026</p>

        <div className="mt-8 space-y-7 text-base leading-7 text-muted-foreground">
          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">1. Acceptance</h2>
            <p>
              thèque is a private personal library for saving and organizing links. By creating an
              account or using thèque (the “Service”), you agree to these Terms. If you do not
              agree, please don’t use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">2. The Service</h2>
            <p>
              thèque lets you save links and turns them into organized cards by reading public
              metadata from the pages you save. thèque is offered free of charge and is under
              active development. Features may change, and parts of the Service may be added,
              removed, or limited at any time.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">3. Your account</h2>
            <p>
              You sign in with your email address using a one-time code. There is no password. You
              are responsible for maintaining access to your email account and for activity that
              happens under your account. Capture tokens you create authenticate saving on your
              behalf; keep them private and revoke any you no longer use.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">4. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="ml-5 list-disc space-y-1">
              <li>use the Service for any unlawful purpose, or to store unlawful content;</li>
              <li>
                attempt to disrupt, overload, or circumvent the Service’s rate limits, quotas, or
                security; or probe, scan, or reverse-engineer its infrastructure;
              </li>
              <li>use automated means to abuse the capture or enrichment pipeline;</li>
              <li>infringe the rights of others or save content you don’t have the right to save.</li>
            </ul>
            <p>
              You are responsible for the links and content you choose to save. We may suspend or
              limit accounts that abuse the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">5. Your content</h2>
            <p>
              The notes, tags, collections, and saved items in your library are yours. You grant
              thèque permission to store and process them, and to fetch and process metadata from
              the pages you save, solely to operate the Service for you. Saved pages and their
              contents remain the property of their respective owners; thèque does not claim
              ownership of third-party content you save.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">6. Automated enrichment</h2>
            <p>
              thèque builds cards using automated extraction and, optionally, AI. This information
              (titles, covers, ratings, categories, and similar fields) is provided for convenience
              and may be incomplete or inaccurate. Don’t rely on it as authoritative.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">7. Availability and data</h2>
            <p>
              The Service is provided on an “as available” basis. We do not guarantee uptime, and we
              may modify, suspend, or discontinue the Service. While we aim to keep your data safe,
              we do not guarantee against loss, so please keep your own copy of anything important.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">8. Disclaimer and liability</h2>
            <p>
              The Service is provided “as is,” without warranties of any kind, express or implied.
              To the fullest extent permitted by law, thèque and its operator will not be liable for
              any indirect, incidental, or consequential damages, or for any loss of data, arising
              from your use of the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">9. Termination</h2>
            <p>
              You may stop using thèque and delete your account at any time. We may suspend or
              terminate access if these Terms are violated or to protect the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">10. Changes</h2>
            <p>
              We may update these Terms as the Service evolves. Material changes will be reflected by
              the “Last updated” date above. Continued use after a change means you accept the
              updated Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-heading text-xl text-foreground">11. Contact</h2>
            <p>
              Questions about these Terms? Contact the site owner at{" "}
              <a
                href="mailto:hello@theque.app"
                className="text-foreground underline underline-offset-4 hover:no-underline"
              >
                hello@theque.app
              </a>
              . See also our{" "}
              <Link
                href="/privacy"
                className="text-foreground underline underline-offset-4 hover:no-underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
