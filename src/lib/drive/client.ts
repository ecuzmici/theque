import "server-only";

import { randomUUID } from "node:crypto";

import { assertSafeFetchUrl } from "@/lib/enrichment/fetch";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const UPLOAD_ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
// files.create returns the id only, so ask for the browser link as well.
const FOLDER_CREATE_ENDPOINT = `${FILES_ENDPOINT}?fields=id,webViewLink`;
const FOLDER_BROWSER_BASE = "https://drive.google.com/drive/folders";

const EPUB_MIME = "application/epub+zip";
const FOLDER_MIME = "application/vnd.google-apps.folder";

const TOKEN_TIMEOUT_MS = 8000;
const DELETE_TIMEOUT_MS = 8000;
const FOLDER_TIMEOUT_MS = 8000;
// An EPUB is a few megabytes, so the upload gets far more time than a token call.
const UPLOAD_TIMEOUT_MS = 60000;

const MAX_RETRIES = 2;
const BACKOFF_MS = 250;

/** Google omits expires_in in rare replies. One hour is the documented default. */
const DEFAULT_TOKEN_TTL_SEC = 3600;
/** Treat the token as dead early, because a token that dies in flight fails the upload. */
const EXPIRY_SKEW_SEC = 60;

export type DriveErrorCode =
  | "drive_not_configured"
  | "token_exchange_failed"
  | "upload_failed"
  | "delete_failed"
  | "folder_create_failed"
  | "folder_share_failed"
  | "network_error";

/**
 * Thrown for every Drive failure. This module never fails open, because a silent
 * failure makes theque report a book as synced when the device does not have it.
 */
export class DriveError extends Error {
  readonly code: DriveErrorCode;
  readonly status?: number;
  /**
   * Set when Drive made the folder but a later step failed. A folder id is not
   * a secret, because it is part of the public share link.
   */
  readonly folderId?: string;

  constructor(code: DriveErrorCode, message: string, status?: number, folderId?: string) {
    super(message);
    this.name = "DriveError";
    this.code = code;
    this.status = status;
    this.folderId = folderId;
  }
}

/** The three OAuth variables. A token call needs these and nothing more. */
type DriveCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type DriveConfig = DriveCredentials & { folderId: string };

function readCredentials(): DriveCredentials | null {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

function readConfig(): DriveConfig | null {
  const credentials = readCredentials();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!credentials || !folderId) return null;
  return { ...credentials, folderId };
}

/** True when all four Drive variables are set. Callers hide the sync UI otherwise. */
export function isDriveConfigured(): boolean {
  return readConfig() !== null;
}

/**
 * The narrower check for the bootstrap call. createSyncFolder makes the folder
 * id, so it must not ask for GOOGLE_DRIVE_FOLDER_ID first.
 */
function requireCredentials(): DriveCredentials {
  const credentials = readCredentials();
  if (!credentials) {
    throw new DriveError(
      "drive_not_configured",
      "Drive sync needs GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN.",
    );
  }
  return credentials;
}

function requireConfig(): DriveConfig {
  const config = readConfig();
  if (!config) {
    throw new DriveError(
      "drive_not_configured",
      "Drive sync needs GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN and GOOGLE_DRIVE_FOLDER_ID.",
    );
  }
  return config;
}

type CachedToken = { value: string; expiresAtMs: number };

// Module scope, so one warm server process reuses the token across uploads.
let cachedToken: CachedToken | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failureReason(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "unknown error";
}

type RequestOptions = {
  timeoutMs: number;
  /**
   * Keep this false for uploads. A 5xx can arrive after Drive stored the file,
   * so a retry there makes a duplicate book on the reader.
   */
  retryServerErrors: boolean;
};

/**
 * Send one Drive request and retry only when Drive states that the call did not run.
 * A 429 is always safe to repeat, because Drive rejects the request before any work.
 * A transport failure never repeats, because the request can still reach Drive.
 */
async function driveFetch(url: URL, init: RequestInit, options: RequestOptions): Promise<Response> {
  try {
    await assertSafeFetchUrl(url);
  } catch {
    throw new DriveError("network_error", `Drive host ${url.hostname} did not resolve to a safe address.`);
  }

  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      // Build the signal per attempt, because an expired signal aborts the retry.
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs) });
    } catch (error) {
      throw new DriveError("network_error", `Drive request failed: ${failureReason(error)}.`);
    }

    const retryable = res.status === 429 || (options.retryServerErrors && res.status >= 500);
    if (!retryable || attempt >= MAX_RETRIES) return res;
    await delay(BACKOFF_MS * 2 ** attempt);
  }
}

/**
 * Exchange the refresh token for an access token, or reuse the cached one.
 * Never log or return the access token, the refresh token or the client secret.
 */
async function getAccessToken(config: DriveCredentials): Promise<string> {
  if (cachedToken && cachedToken.expiresAtMs > Date.now()) return cachedToken.value;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  });

  const res = await driveFetch(
    new URL(TOKEN_ENDPOINT),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
    },
    { timeoutMs: TOKEN_TIMEOUT_MS, retryServerErrors: true },
  );

  if (!res.ok) {
    cachedToken = null;
    throw new DriveError("token_exchange_failed", "Google refused the refresh token.", res.status);
  }

  let payload: { access_token?: unknown; expires_in?: unknown };
  try {
    payload = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  } catch {
    throw new DriveError("token_exchange_failed", "Google sent an unreadable token response.", res.status);
  }

  const token = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!token) {
    throw new DriveError("token_exchange_failed", "Google sent no access token.", res.status);
  }

  const ttlSec =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) && payload.expires_in > 0
      ? payload.expires_in
      : DEFAULT_TOKEN_TTL_SEC;
  const lifetimeMs = Math.max(ttlSec - EXPIRY_SKEW_SEC, 0) * 1000;
  cachedToken = { value: token, expiresAtMs: Date.now() + lifetimeMs };
  return token;
}

/** Drop the cached token after a 401, so the next call asks Google for a new one. */
function invalidateToken(): void {
  cachedToken = null;
}

/**
 * Build the error for a folder that exists but stays private. The message
 * carries the id, because the operator must keep the folder that Drive made.
 */
function shareFailure(folderId: string, status?: number): DriveError {
  return new DriveError(
    "folder_share_failed",
    `Drive made the folder ${folderId}, but the share step failed. ` +
      `Keep the id: set GOOGLE_DRIVE_FOLDER_ID=${folderId}. ` +
      `Then set "Anyone with the link" on that folder in Drive by hand.`,
    status,
    folderId,
  );
}

/**
 * Create the Drive folder that holds the synced EPUB files, then share it.
 * Run this once, and put the returned id in GOOGLE_DRIVE_FOLDER_ID.
 *
 * The drive.file scope shows the app only the files that the app made. A folder
 * that a person makes in the Drive web UI stays invisible, and every upload to
 * it fails with a 404. Thus the app must make the folder itself.
 *
 * The folder becomes readable by anybody who holds the link, because KoboCloud
 * reads a public share link and cannot sign in.
 */
export async function createSyncFolder(name: string): Promise<{ id: string; webViewLink: string }> {
  const credentials = requireCredentials();

  const folderName = name.trim();
  if (!folderName) throw new DriveError("folder_create_failed", "The new folder needs a name.");

  const token = await getAccessToken(credentials);

  const created = await driveFetch(
    new URL(FOLDER_CREATE_ENDPOINT),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: folderName, mimeType: FOLDER_MIME }),
    },
    // Keep this false. A 5xx can arrive after Drive made the folder, so a retry
    // makes a second folder and splits the library across the two.
    { timeoutMs: FOLDER_TIMEOUT_MS, retryServerErrors: false },
  );

  if (created.status === 401) {
    invalidateToken();
    throw new DriveError("folder_create_failed", "Drive rejected the access token.", 401);
  }
  if (!created.ok) {
    throw new DriveError("folder_create_failed", "Drive refused the new folder.", created.status);
  }

  let payload: { id?: unknown; webViewLink?: unknown };
  try {
    payload = (await created.json()) as { id?: unknown; webViewLink?: unknown };
  } catch {
    throw new DriveError("folder_create_failed", "Drive sent an unreadable folder response.", created.status);
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) throw new DriveError("folder_create_failed", "Drive sent no folder id.", created.status);
  const webViewLink =
    typeof payload.webViewLink === "string" && payload.webViewLink.trim()
      ? payload.webViewLink.trim()
      : `${FOLDER_BROWSER_BASE}/${id}`;

  let shared: Response;
  try {
    shared = await driveFetch(
      new URL(`${FILES_ENDPOINT}/${encodeURIComponent(id)}/permissions`),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      },
      // A repeat is safe here. The same reader permission twice stays one permission.
      { timeoutMs: FOLDER_TIMEOUT_MS, retryServerErrors: true },
    );
  } catch (error) {
    // driveFetch throws for a transport failure. Report the id anyway, or the
    // operator loses a folder that Drive already made.
    throw shareFailure(id, error instanceof DriveError ? error.status : undefined);
  }

  if (shared.status === 401) invalidateToken();
  if (!shared.ok) throw shareFailure(id, shared.status);

  return { id, webViewLink };
}

/** Build the multipart/related payload as bytes, so the EPUB stays byte exact. */
function multipartBody(boundary: string, metadata: string, bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${EPUB_MIME}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return body;
}

/**
 * Upload one EPUB into the configured Drive folder.
 * The upload never repeats after a 5xx or a transport failure, because Drive can
 * store the file and still fail the reply. A duplicate book is worse than an error
 * the caller can see, so the caller decides whether to send the file again.
 */
export async function uploadEpub(args: { name: string; bytes: Uint8Array }): Promise<{ id: string; name: string }> {
  const config = requireConfig();

  const fileName = args.name.trim();
  if (!fileName) throw new DriveError("upload_failed", "The upload needs a file name.");
  if (args.bytes.byteLength === 0) throw new DriveError("upload_failed", "The upload needs a non-empty file.");

  const token = await getAccessToken(config);
  const boundary = `theque-${randomUUID()}`;
  const metadata = JSON.stringify({ name: fileName, parents: [config.folderId], mimeType: EPUB_MIME });

  const res = await driveFetch(
    new URL(UPLOAD_ENDPOINT),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody(boundary, metadata, args.bytes),
    },
    { timeoutMs: UPLOAD_TIMEOUT_MS, retryServerErrors: false },
  );

  if (res.status === 401) {
    invalidateToken();
    throw new DriveError("upload_failed", "Drive rejected the access token.", 401);
  }
  if (!res.ok) {
    // Keep the response body out of the error. It can carry the request headers.
    throw new DriveError("upload_failed", "Drive refused the upload.", res.status);
  }

  let payload: { id?: unknown; name?: unknown };
  try {
    payload = (await res.json()) as { id?: unknown; name?: unknown };
  } catch {
    throw new DriveError("upload_failed", "Drive sent an unreadable upload response.", res.status);
  }

  const id = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!id) throw new DriveError("upload_failed", "Drive sent no file id.", res.status);
  const storedName = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : fileName;

  return { id, name: storedName };
}

/**
 * Remove one file from Drive.
 * A 404 counts as success, because the goal state is that the file is gone.
 */
export async function deleteDriveFile(id: string): Promise<void> {
  const config = requireConfig();

  const fileId = id.trim();
  if (!fileId) throw new DriveError("delete_failed", "The delete needs a file id.");

  const token = await getAccessToken(config);

  const res = await driveFetch(
    new URL(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}`),
    { method: "DELETE", headers: { authorization: `Bearer ${token}`, accept: "application/json" } },
    { timeoutMs: DELETE_TIMEOUT_MS, retryServerErrors: true },
  );

  if (res.status === 404) return;
  if (res.status === 401) {
    invalidateToken();
    throw new DriveError("delete_failed", "Drive rejected the access token.", 401);
  }
  if (!res.ok) throw new DriveError("delete_failed", "Drive refused the delete.", res.status);
}
