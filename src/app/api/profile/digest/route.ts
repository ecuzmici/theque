import { getSessionUserOrNull } from "@/lib/auth/session-user";
import {
  parseDigestPreferencesPatch,
  type DigestPreferencesResponseBody,
} from "@/lib/profiles/digest-preferences";
import {
  getDigestPreferencesForUser,
  setDigestPreferencesForUser,
} from "@/lib/profiles/profiles";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Weekly-letter preferences for the signed-in user. Identity always comes from
 * the session — a `user_id` in the body is never read — and the write itself is
 * re-checked by RLS on `public.profiles`.
 */
export async function GET() {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const body: DigestPreferencesResponseBody = {
    preferences: await getDigestPreferencesForUser(user.id),
  };
  return Response.json(body);
}

export async function PATCH(req: Request) {
  const user = await getSessionUserOrNull();
  if (!user) return Response.json({ code: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`profile-digest:${user.id}`, 20, 60);
  if (!rl.ok) {
    return Response.json(
      { code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } },
    );
  }

  let bodyUnknown: unknown;
  try {
    bodyUnknown = await req.json();
  } catch {
    return Response.json({ code: "invalid_body" }, { status: 400 });
  }

  const parsed = parseDigestPreferencesPatch(bodyUnknown);
  if (!parsed.ok) {
    return Response.json({ code: parsed.code }, { status: 400 });
  }

  const result = await setDigestPreferencesForUser(user.id, parsed.patch);
  if (!result.ok) {
    return Response.json({ code: "update_failed" }, { status: 500 });
  }

  const body: DigestPreferencesResponseBody = { preferences: result.preferences };
  return Response.json(body);
}
