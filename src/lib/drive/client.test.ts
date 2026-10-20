import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The real guard resolves DNS. Drive hosts are constants, so the check adds nothing here.
vi.mock("@/lib/enrichment/fetch", () => ({ assertSafeFetchUrl: vi.fn(async () => {}) }));

const fetchMock = vi.fn();

type DriveModule = typeof import("@/lib/drive/client");
let drive: DriveModule;

const EPUB_BYTES = new TextEncoder().encode("PK fake epub payload");

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.GOOGLE_DRIVE_CLIENT_ID = "drive-client-id";
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = "drive-client-secret";
  process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "drive-refresh-token";
  process.env.GOOGLE_DRIVE_FOLDER_ID = "folder-123";
  // Reload the module so each test starts with an empty access-token cache.
  vi.resetModules();
  drive = await import("@/lib/drive/client");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_DRIVE_CLIENT_ID;
  delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  delete process.env.GOOGLE_DRIVE_FOLDER_ID;
});

function response(status: number, body?: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body ?? {} };
}

function tokenResponse(value = "access-token", expiresIn = 3600) {
  return response(200, { access_token: value, expires_in: expiresIn });
}

function uploadResponse(id = "file-1", name = "Piranesi.epub") {
  return response(200, { id, name, mimeType: "application/epub+zip" });
}

// Pass null for webViewLink to model the reply that carries the id only.
function folderResponse(
  id = "folder-new",
  webViewLink: string | null = "https://drive.google.com/drive/folders/folder-new?usp=drive_link",
) {
  return response(200, webViewLink === null ? { id } : { id, webViewLink });
}

function isTokenCall(call: unknown[]): boolean {
  return String(call[0]).startsWith("https://oauth2.googleapis.com/token");
}

function callInit(index: number): RequestInit & { headers: Record<string, string> } {
  return fetchMock.mock.calls[index][1] as RequestInit & { headers: Record<string, string> };
}

async function caught(promise: Promise<unknown>): Promise<InstanceType<DriveModule["DriveError"]>> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(drive.DriveError);
  return error as InstanceType<DriveModule["DriveError"]>;
}

describe("isDriveConfigured", () => {
  it("is true when all four variables are set", () => {
    expect(drive.isDriveConfigured()).toBe(true);
  });

  it("is false when one variable is missing", () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    expect(drive.isDriveConfigured()).toBe(false);
  });
});

describe("missing configuration", () => {
  it("throws drive_not_configured on upload and never calls fetch", async () => {
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));

    expect(error.code).toBe("drive_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws drive_not_configured on delete and never calls fetch", async () => {
    delete process.env.GOOGLE_DRIVE_CLIENT_SECRET;

    const error = await caught(drive.deleteDriveFile("file-1"));

    expect(error.code).toBe("drive_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws drive_not_configured on createSyncFolder when a credential is missing", async () => {
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;

    const error = await caught(drive.createSyncFolder("Kobo"));

    expect(error.code).toBe("drive_not_configured");
    expect(error.message).not.toContain("GOOGLE_DRIVE_FOLDER_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("createSyncFolder", () => {
  it("creates the folder and then shares it with anyone who holds the link", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(folderResponse())
      .mockResolvedValueOnce(response(200, { id: "perm-1", role: "reader", type: "anyone" }));

    const folder = await drive.createSyncFolder("Kobo");

    expect(folder).toEqual({
      id: "folder-new",
      webViewLink: "https://drive.google.com/drive/folders/folder-new?usp=drive_link",
    });

    const createInit = callInit(1);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink",
    );
    expect(createInit.method).toBe("POST");
    expect(createInit.headers.authorization).toBe("Bearer access-token");
    expect(createInit.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(createInit.body))).toEqual({
      name: "Kobo",
      mimeType: "application/vnd.google-apps.folder",
    });

    const shareInit = callInit(2);
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      "https://www.googleapis.com/drive/v3/files/folder-new/permissions",
    );
    expect(shareInit.method).toBe("POST");
    expect(shareInit.headers.authorization).toBe("Bearer access-token");
    expect(JSON.parse(String(shareInit.body))).toEqual({ role: "reader", type: "anyone" });
  });

  it("works without GOOGLE_DRIVE_FOLDER_ID, because it produces that value", async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(folderResponse())
      .mockResolvedValueOnce(response(200, {}));

    const folder = await drive.createSyncFolder("Kobo");

    expect(folder.id).toBe("folder-new");
    expect(drive.isDriveConfigured()).toBe(false);
  });

  it("builds a browser link when Drive sends no webViewLink", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(folderResponse("abc123", null))
      .mockResolvedValueOnce(response(200, {}));

    const folder = await drive.createSyncFolder("Kobo");

    expect(folder.webViewLink).toBe("https://drive.google.com/drive/folders/abc123");
  });

  it("reports the folder id when the share step fails", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(folderResponse())
      .mockResolvedValueOnce(response(403));

    const error = await caught(drive.createSyncFolder("Kobo"));

    expect(error.code).toBe("folder_share_failed");
    expect(error.status).toBe(403);
    expect(error.folderId).toBe("folder-new");
    expect(error.message).toContain("GOOGLE_DRIVE_FOLDER_ID=folder-new");
  });

  it("reports the folder id when the share step never reaches Drive", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(folderResponse())
      .mockRejectedValueOnce(new Error("socket hang up"));

    const error = await caught(drive.createSyncFolder("Kobo"));

    expect(error.code).toBe("folder_share_failed");
    expect(error.folderId).toBe("folder-new");
  });

  it("throws token_exchange_failed when Google refuses the refresh token", async () => {
    fetchMock.mockResolvedValue(response(400));

    const error = await caught(drive.createSyncFolder("Kobo"));

    expect(error.code).toBe("token_exchange_failed");
    expect(error.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error.message).not.toContain("drive-client-secret");
  });

  it("never repeats the create call after a 5xx, because Drive may have made the folder", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(500));

    const error = await caught(drive.createSyncFolder("Kobo"));

    expect(error.code).toBe("folder_create_failed");
    expect(error.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips the share step for a private folder", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(folderResponse());

    const folder = await drive.createSyncFolder("Kindle", { share: false });

    expect(folder.id).toBe("folder-new");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/permissions"))).toBe(false);
  });

  it("rejects an empty folder name before it asks for a token", async () => {
    const error = await caught(drive.createSyncFolder("   "));

    expect(error.code).toBe("folder_create_failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("uploadEpub", () => {
  it("posts a multipart body to the folder and returns the created file", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(uploadResponse());

    const created = await drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES });

    expect(created).toEqual({ id: "file-1", name: "Piranesi.epub" });

    const tokenInit = callInit(0);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://oauth2.googleapis.com/token");
    expect(tokenInit.method).toBe("POST");
    expect(String(tokenInit.body)).toContain("grant_type=refresh_token");
    expect(String(tokenInit.body)).toContain("refresh_token=drive-refresh-token");

    const uploadInit = callInit(1);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    );
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.headers.authorization).toBe("Bearer access-token");
    expect(uploadInit.headers["content-type"]).toMatch(/^multipart\/related; boundary=theque-/);

    const body = new TextDecoder().decode(uploadInit.body as Uint8Array);
    expect(body).toContain('"parents":["folder-123"]');
    expect(body).toContain('"mimeType":"application/epub+zip"');
    expect(body).toContain('"name":"Piranesi.epub"');
    expect(body).toContain("fake epub payload");
  });

  it("posts a kindle upload to the kindle folder", async () => {
    process.env.GOOGLE_DRIVE_KINDLE_FOLDER_ID = "kindle-folder";
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(uploadResponse());

    await drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES, target: "kindle" });
    delete process.env.GOOGLE_DRIVE_KINDLE_FOLDER_ID;

    const body = new TextDecoder().decode(callInit(1).body as Uint8Array);
    expect(body).toContain('"parents":["kindle-folder"]');
    expect(body).not.toContain("folder-123");
  });

  it("never sends a kindle upload to the kobo folder", async () => {
    // GOOGLE_DRIVE_FOLDER_ID is set and GOOGLE_DRIVE_KINDLE_FOLDER_ID is not.
    expect(drive.isDriveConfigured("kindle")).toBe(false);

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES, target: "kindle" }));

    expect(error.code).toBe("drive_not_configured");
    expect(error.message).toContain("GOOGLE_DRIVE_KINDLE_FOLDER_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty file before it asks for a token", async () => {
    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: new Uint8Array(0) }));

    expect(error.code).toBe("upload_failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses the cached access token across two uploads", async () => {
    fetchMock.mockImplementation(async (url: URL) =>
      String(url).startsWith("https://oauth2.googleapis.com/token") ? tokenResponse() : uploadResponse(),
    );

    await drive.uploadEpub({ name: "One.epub", bytes: EPUB_BYTES });
    await drive.uploadEpub({ name: "Two.epub", bytes: EPUB_BYTES });

    expect(fetchMock.mock.calls.filter(isTokenCall)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes the token when the 60 second skew already expired it", async () => {
    // expires_in 60 minus the 60 second skew leaves no usable lifetime.
    fetchMock.mockImplementation(async (url: URL) =>
      String(url).startsWith("https://oauth2.googleapis.com/token") ? tokenResponse("short-lived", 60) : uploadResponse(),
    );

    await drive.uploadEpub({ name: "One.epub", bytes: EPUB_BYTES });
    await drive.uploadEpub({ name: "Two.epub", bytes: EPUB_BYTES });

    expect(fetchMock.mock.calls.filter(isTokenCall)).toHaveLength(2);
  });

  it("throws on 401 and drops the cached token", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(uploadResponse());

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));
    expect(error.code).toBe("upload_failed");
    expect(error.status).toBe(401);

    await drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES });
    expect(fetchMock.mock.calls.filter(isTokenCall)).toHaveLength(2);
  });

  it("never repeats an upload after a 5xx, because Drive may have stored the file", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(500));

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));

    expect(error.code).toBe("upload_failed");
    expect(error.status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws upload_failed when the reply carries no file id", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(200, { name: "Piranesi.epub" }));

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));

    expect(error.code).toBe("upload_failed");
  });
});

describe("token exchange failures", () => {
  it("retries a 5xx twice and then throws token_exchange_failed", async () => {
    fetchMock.mockResolvedValue(response(503));

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));

    expect(error.code).toBe("token_exchange_failed");
    expect(error.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error.message).not.toContain("drive-refresh-token");
    expect(error.message).not.toContain("drive-client-secret");
  });

  it("does not retry a 400", async () => {
    fetchMock.mockResolvedValue(response(400));

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));

    expect(error.code).toBe("token_exchange_failed");
    expect(error.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a thrown network error as DriveError", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const error = await caught(drive.uploadEpub({ name: "Piranesi.epub", bytes: EPUB_BYTES }));

    expect(error.code).toBe("network_error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("deleteDriveFile", () => {
  it("sends DELETE with the bearer token", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(204));

    await expect(drive.deleteDriveFile("file-1")).resolves.toBeUndefined();

    expect(String(fetchMock.mock.calls[1][0])).toBe("https://www.googleapis.com/drive/v3/files/file-1");
    expect(callInit(1).method).toBe("DELETE");
    expect(callInit(1).headers.authorization).toBe("Bearer access-token");
  });

  it("treats a 404 as success", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(404));

    await expect(drive.deleteDriveFile("gone-already")).resolves.toBeUndefined();
  });

  it("retries a 429 and then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(response(429))
      .mockResolvedValueOnce(response(204));

    await expect(drive.deleteDriveFile("file-1")).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws delete_failed with the status on a 403", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(403));

    const error = await caught(drive.deleteDriveFile("file-1"));

    expect(error.code).toBe("delete_failed");
    expect(error.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("downloadDriveFile", () => {
  it("reads the file bytes with alt=media and needs no folder variable", async () => {
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce({
      ...response(200),
      arrayBuffer: async () => EPUB_BYTES.slice().buffer,
    });

    const bytes = await drive.downloadDriveFile("file-1");

    expect([...bytes]).toEqual([...EPUB_BYTES]);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://www.googleapis.com/drive/v3/files/file-1?alt=media",
    );
    expect(callInit(1).headers.authorization).toBe("Bearer access-token");
  });

  it("throws download_failed with the status on a 404", async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(response(404));

    const error = await caught(drive.downloadDriveFile("missing"));

    expect(error.code).toBe("download_failed");
    expect(error.status).toBe(404);
  });
});
