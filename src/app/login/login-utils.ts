export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 10;

export function sanitizeRedirectPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/library";
  }

  return value;
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
