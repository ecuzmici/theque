export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

const REDIRECT_BASE = "https://redirect.invalid";

/**
 * Keeps a `next` redirect on this origin. The URL parser removes tab, CR and
 * LF, so `/\t/evil.com` becomes `//evil.com`. The function rejects control
 * characters and backslashes, and then checks the parsed origin.
 */
export function sanitizeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/")) return "/library";
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/library";
  let url: URL;
  try {
    url = new URL(value, REDIRECT_BASE);
  } catch {
    return "/library";
  }
  if (url.origin !== REDIRECT_BASE) return "/library";
  return `${url.pathname}${url.search}${url.hash}`;
}

const AUTH_REASON_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the sign-in, or the provider refused it.",
  missing_code: "The sign-in link is incomplete. Start the sign-in again.",
  missing_env: "Sign-in is not available right now. Try again later.",
  exchange_failed: "The sign-in session expired or was already used. Start the sign-in again.",
};

const AUTH_REASON_FALLBACK = "Something went wrong during sign-in.";

/** Maps a `reason` query value to fixed text. The raw value never reaches the page. */
export function authReasonMessage(reason: string | null): string | null {
  if (!reason) return null;
  return AUTH_REASON_MESSAGES[reason] ?? AUTH_REASON_FALLBACK;
}

export function normalizeOtpToken(value: string) {
  return value.replace(/\D/g, "").slice(0, OTP_MAX_LENGTH);
}

export function isValidOtpToken(value: string) {
  return value.length >= OTP_MIN_LENGTH && value.length <= OTP_MAX_LENGTH;
}

export function getAuthErrorMessage(error: { message?: string } | null | undefined, fallback: string) {
  const message = error?.message?.trim();
  return message || fallback;
}
