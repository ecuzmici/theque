"use client";

import { Star } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateMedium } from "@/lib/format-timestamp";
import { MAX_NOTE_LENGTH } from "@/lib/input-limits";
import { cn } from "@/lib/utils";

/** Fields the card sends through the item PATCH (the mark-done path). */
export type RatingCardPatch = {
  status?: "done";
  rating_personal?: number | null;
  verdict?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

/**
 * The taste loop on the detail page. A tap on a star marks the item done with
 * that rating and opens the verdict field. A done item shows its rating and
 * verdict, and both stay editable.
 */
export function ItemRatingCard({
  verb,
  isDone,
  rating,
  verdict,
  doneAt,
  onSave,
  className,
}: {
  /** Category done verb from `doneVerb()`: "read", "watched", … */
  verb: string;
  isDone: boolean;
  rating: number | null;
  verdict: string | null;
  doneAt: string | null;
  /** Sends the patch. Resolves false when the save fails. */
  onSave: (patch: RatingCardPatch) => Promise<boolean>;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Optimistic rating while a save runs; undefined means "use the prop".
  const [pendingRating, setPendingRating] = useState<number | null | undefined>(undefined);
  const [ratingError, setRatingError] = useState(false);
  const [draft, setDraft] = useState(verdict ?? "");
  const [verdictState, setVerdictState] = useState<SaveState>("idle");
  // State drives the render; the ref guards against a second save (blur, then
  // the Save button) before the state update lands.
  const [savedVerdict, setSavedVerdict] = useState((verdict ?? "").trim());
  const savedVerdictRef = useRef(savedVerdict);

  const shownRating = pendingRating !== undefined ? pendingRating : rating;
  const litStars = hover ?? shownRating ?? 0;
  const busy = pendingRating !== undefined;

  async function rate(n: number) {
    if (busy) return;
    // A tap on the current rating of a done item clears it.
    const next = isDone && rating === n ? null : n;
    setPendingRating(next);
    setRatingError(false);
    const ok = await onSave(isDone ? { rating_personal: next } : { status: "done", rating_personal: next });
    setPendingRating(undefined);
    if (!ok) setRatingError(true);
  }

  async function markDoneWithoutRating() {
    if (busy) return;
    setPendingRating(null);
    setRatingError(false);
    const ok = await onSave({ status: "done" });
    setPendingRating(undefined);
    if (!ok) setRatingError(true);
  }

  async function saveVerdict() {
    const text = draft.trim();
    if (text === savedVerdictRef.current) return;
    const previous = savedVerdictRef.current;
    savedVerdictRef.current = text;
    setSavedVerdict(text);
    setVerdictState("saving");
    const ok = await onSave({ verdict: text || null });
    if (ok) {
      setVerdictState("saved");
    } else {
      savedVerdictRef.current = previous;
      setSavedVerdict(previous);
      setVerdictState("error");
    }
  }

  const verdictDirty = draft.trim() !== savedVerdict;
  const doneDate = doneAt ? formatDateMedium(doneAt) : null;
  const heading = isDone ? (verb === "done" ? "Done" : `You ${verb} it`) : `${capitalize(verb)} it?`;
  const hint = isDone
    ? doneDate
    : verb === "done"
      ? "Tap a star to rate it and mark it done"
      : `Tap a star to rate it and mark it ${verb}`;

  return (
    <section
      aria-label="Rating and verdict"
      className={cn(
        "rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-1 text-center sm:flex-row sm:justify-between sm:gap-3 sm:text-left">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{heading}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div
          className="flex items-center sm:-mr-1"
          role="radiogroup"
          aria-label="Your rating"
          aria-busy={busy || undefined}
          onPointerLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={shownRating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              disabled={busy}
              className="ks-pointer-coarse-min-hit inline-flex items-center justify-center rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress"
              onPointerEnter={() => setHover(n)}
              onClick={() => void rate(n)}
            >
              <Star
                className={cn(
                  "size-6 transition",
                  n <= litStars ? "fill-amber-500 text-amber-500" : "text-muted-foreground/50",
                )}
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>

      {ratingError ? (
        <p role="alert" className="mt-2 text-center text-sm text-destructive sm:text-left">
          Could not save. Try again.
        </p>
      ) : null}

      {isDone ? (
        <div className="mt-3">
          <label htmlFor="item-verdict" className="sr-only">
            Verdict
          </label>
          <Textarea
            id="item-verdict"
            value={draft}
            rows={2}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="One line for future you: why it stuck (or didn't)"
            className="resize-none bg-background/60"
            onChange={(e) => {
              setDraft(e.target.value);
              if (verdictState !== "saving") setVerdictState("idle");
            }}
            onBlur={() => void saveVerdict()}
          />
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground not-empty:mt-1.5 not-empty:min-h-8">
            {verdictState === "saving" ? <span>Saving…</span> : null}
            {verdictState === "saved" && !verdictDirty ? <span>Saved</span> : null}
            {verdictState === "error" ? (
              <span role="alert" className="text-destructive">
                Could not save. Try again.
              </span>
            ) : null}
            {verdictDirty && verdictState !== "saving" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void saveVerdict()}>
                Save verdict
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-1 flex justify-center sm:justify-start">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="px-0 text-muted-foreground"
            disabled={busy}
            onClick={() => void markDoneWithoutRating()}
          >
            {verb === "done" ? "Mark done without a rating" : `Mark ${verb} without a rating`}
          </Button>
        </div>
      )}
    </section>
  );
}
