import { deleteAccount } from "@/lib/account/delete-account";
import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const CONFIRM_WORD = "delete";

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

/**
 * Self-service account deletion (ADR 0013, decision B). Thin adapter: this
 * route only resolves identity and validates the confirmation string — every
 * ordering/failure decision lives in the injectable `deleteAccount`
 * orchestration function, which this route wires to the real admin client.
 *
 * Identity always comes from the session, never from the request body — a
 * `userId`/`id` field in the body is intentionally never read.
 */
export async function POST(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) {
    return jsonResponse({ code: "unauthorized" }, { status: 401 });
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return jsonResponse({ code: "invalid_body" }, { status: 400 });
  }

  const body = bodyUnknown as { confirm?: unknown };
  if (body?.confirm !== CONFIRM_WORD) {
    return jsonResponse({ code: "invalid_confirmation" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await deleteAccount(user.id, {
    storage: admin.storage,
    adminAuth: admin.auth.admin,
  });

  if (!result.ok) {
    return jsonResponse({ code: "delete_failed" }, { status: 500 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  return jsonResponse({ deleted: true, orphanedFileCount: result.orphanedFileCount });
}
