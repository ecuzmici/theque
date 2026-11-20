"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { saveReadingGoal, type GoalFormState } from "@/app/(app)/diary/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { READING_GOAL_MAX, READING_GOAL_MIN } from "@/lib/diary/goal";

const INITIAL: GoalFormState = { error: null, saved: 0 };

/**
 * Sets, changes or removes the yearly goal. Without a goal it shows one
 * quiet button; the field opens on a tap.
 */
export function GoalForm({ goal, year }: { goal: number | null; year: number }) {
  const [state, action, pending] = useActionState(saveReadingGoal, INITIAL);
  const [open, setOpen] = useState(false);
  // A controlled value, so the typed number stays after a failed save.
  const [value, setValue] = useState(String(goal ?? 24));
  const inputId = useId();
  const errorId = useId();

  // Close the field after each save.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- closes the editor once the server action reports a save
    if (state.saved > 0) setOpen(false);
  }, [state.saved]);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
        {goal == null ? `Set a goal for ${year}` : "Change goal"}
      </Button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          Books in {year}
        </label>
        <Input
          id={inputId}
          name="goal"
          type="number"
          inputMode="numeric"
          min={READING_GOAL_MIN}
          max={READING_GOAL_MAX}
          step={1}
          required
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? errorId : undefined}
          className="h-9 w-24 tabular-nums"
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving" : "Save"}
      </Button>
      <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)} disabled={pending}>
        Cancel
      </Button>
      {goal != null ? (
        <Button
          type="submit"
          name="intent"
          value="remove"
          formNoValidate
          variant="ghost"
          size="lg"
          disabled={pending}
          className="text-muted-foreground"
        >
          Remove goal
        </Button>
      ) : null}
      {state.error ? (
        <p id={errorId} role="alert" className="basis-full text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
