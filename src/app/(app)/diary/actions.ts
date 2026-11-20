"use server";

import { revalidatePath } from "next/cache";

import { parseReadingGoal, READING_GOAL_KEY, READING_GOAL_MAX, READING_GOAL_MIN } from "@/lib/diary/goal";
import { createClient } from "@/lib/supabase/server";

export type GoalFormState = { error: string | null; saved: number };

/**
 * Saves or removes the yearly reading goal in the auth user metadata.
 * The session client writes only the signed-in user's own metadata.
 */
export async function saveReadingGoal(prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  const supabase = await createClient();
  // A network check, so a signed-out JWT cannot write.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in again to set a goal.", saved: prev.saved };

  const remove = formData.get("intent") === "remove";
  const goal = remove ? null : parseReadingGoal(formData.get("goal"));
  if (!remove && goal == null) {
    return { error: `Enter a whole number from ${READING_GOAL_MIN} to ${READING_GOAL_MAX}.`, saved: prev.saved };
  }

  const { error } = await supabase.auth.updateUser({ data: { [READING_GOAL_KEY]: goal } });
  if (error) return { error: "The goal did not save. Try again.", saved: prev.saved };

  // Get a new access token, so that its claims carry the new metadata.
  await supabase.auth.refreshSession();
  revalidatePath("/diary");
  return { error: null, saved: prev.saved + 1 };
}
