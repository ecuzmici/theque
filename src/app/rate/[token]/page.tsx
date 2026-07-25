import type { Metadata } from "next";
import Link from "next/link";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  applyRatingFromLink,
  type ApplyRatingFailureReason,
  type RatedItem,
} from "@/lib/email/apply-rating";
import {
  mintRatingToken,
  RATING_STARS,
  verifyRatingToken,
  type RatingLinkFailureReason,
  type RatingLinkPayload,
} from "@/lib/email/rating-link";
import { doneVerb } from "@/lib/item-labels";
import { cn } from "@/lib/utils";

// The page writes to the database on load, so it must never be prerendered
// or served from a cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rating saved | thèque",
  // These URLs carry a credential — keep them out of search indexes entirely.
  robots: { index: false, follow: false },
};

type Problem = { heading: string; body: string };

const PROBLEMS: Record<RatingLinkFailureReason | ApplyRatingFailureReason, Problem> = {
  expired: {
    heading: "That link has expired",
    body: "Rating links stay live for 30 days. You can still rate this one from your library — it takes a tap.",
  },
  malformed: {
    heading: "That link doesn't look right",
    body: "It may have been cut in half by your email app. Try the original email again, or rate the item from your library.",
  },
  bad_signature: {
    heading: "That link isn't valid",
    body: "We couldn't verify it, so nothing was saved. Open your library to rate the item yourself.",
  },
  invalid_stars: {
    heading: "That link isn't valid",
    body: "We couldn't verify it, so nothing was saved. Open your library to rate the item yourself.",
  },
  not_found: {
    heading: "That item is gone",
    body: "It isn't in your library any more, so there was nothing to rate.",
  },
  missing_secret: {
    heading: "We couldn't save that rating",
    body: "Something is misconfigured on our side. Nothing was changed — please try again from your library.",
  },
  server_misconfigured: {
    heading: "We couldn't save that rating",
    body: "Something is misconfigured on our side. Nothing was changed — please try again from your library.",
  },
  write_failed: {
    heading: "We couldn't save that rating",
    body: "Something went wrong on our side and nothing was changed. Try the link again, or rate the item from your library.",
  },
};

export default async function RatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const verification = verifyRatingToken(token);
  if (!verification.ok) {
    return <RateCard>{renderProblem(PROBLEMS[verification.reason])}</RateCard>;
  }

  const result = await applyRatingFromLink(verification.payload);
  if (!result.ok) {
    return <RateCard>{renderProblem(PROBLEMS[result.reason])}</RateCard>;
  }

  return (
    <RateCard>
      <Confirmation payload={verification.payload} item={result.item} />
    </RateCard>
  );
}

/** Public, app-shell-less page — the visitor is not signed in. */
function RateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm">
          {children}
        </section>
        <p className="mt-6 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground hover:underline underline-offset-4">
            thèque
          </Link>
        </p>
      </main>
    </div>
  );
}

function renderProblem({ heading, body }: Problem) {
  return (
    <>
      <h1 className="font-heading text-2xl tracking-[0.02em] text-foreground">{heading}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Button
        nativeButton={false}
        render={<Link href="/library" />}
        size="lg"
        className="mt-7 h-11 min-h-11 w-full px-6 text-base"
      >
        Open your library
      </Button>
    </>
  );
}

function Confirmation({ payload, item }: { payload: RatingLinkPayload; item: RatedItem }) {
  const title = item.title ?? item.domain;
  const verb = doneVerb(item.category);

  return (
    <>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Saved</p>
      <h1 className="mt-3 font-heading text-2xl leading-snug tracking-[0.02em] text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {verb === "done" ? "Marked done" : `You ${verb} it`} · {payload.stars} of 5
      </p>

      <StarCorrection payload={payload} />

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Tapped the wrong star? Pick the right one — it saves straight away.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        <Button
          nativeButton={false}
          render={<Link href={`/item/${item.id}`} />}
          size="lg"
          className="h-11 min-h-11 w-full px-6 text-base"
        >
          Add a note about it
        </Button>
        <Button
          nativeButton={false}
          render={<Link href="/library" />}
          size="lg"
          variant="outline"
          className="h-11 min-h-11 w-full px-6 text-base"
        >
          Open your library
        </Button>
      </div>
    </>
  );
}

/**
 * The other star values, one tap away. This is load-bearing: the rating is
 * written on load, so a mistyped tap — or an email client that prefetched the
 * link on the user's behalf — has to be correctable without a login.
 *
 * Deliberately plain `<a>` elements, not `<Link>`: the router prefetches links
 * in the viewport, and prefetching these would render the page for every star
 * value and write all five ratings in turn. Each sibling token also reuses the
 * original expiry, so correcting a rating never extends the link's lifetime.
 */
function StarCorrection({ payload }: { payload: RatingLinkPayload }) {
  return (
    <div
      className="mt-6 flex items-center justify-center gap-1"
      role="group"
      aria-label="Change your rating"
    >
      {RATING_STARS.map((stars) => (
        <a
          key={stars}
          href={`/rate/${mintRatingToken({
            itemId: payload.itemId,
            userId: payload.userId,
            stars,
            expiresAtSeconds: payload.expiresAtSeconds,
          })}`}
          aria-label={`${stars} star${stars > 1 ? "s" : ""}`}
          aria-current={stars === payload.stars ? "true" : undefined}
          className="ks-pointer-coarse-min-hit rounded-md p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Star
            className={cn(
              "size-8 transition",
              stars <= payload.stars ? "fill-amber-500 text-amber-500" : "text-muted-foreground/40",
            )}
            aria-hidden
          />
        </a>
      ))}
    </div>
  );
}
