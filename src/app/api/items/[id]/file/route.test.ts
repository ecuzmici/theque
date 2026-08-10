// @vitest-environment node
import { createHash } from "node:crypto";

import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readEpubMetadata } from "@/lib/epub/metadata";
import { MAX_BOOK_FILE_BYTES } from "@/lib/input-limits";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  class DriveError extends Error {
    readonly code: string;
    readonly status?: number;

    constructor(code: string, message: string, status?: number) {
      super(message);
      this.name = "DriveError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    DriveError,
    getSessionUserOrNull: vi.fn(),
    from: vi.fn(),
    updateSpy: vi.fn(),
    isDriveConfigured: vi.fn(),
    uploadEpub: vi.fn(),
    deleteDriveFile: vi.fn(),
  };
});

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: mocks.getSessionUserOrNull,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: mocks.from }),
}));

vi.mock("@/lib/drive/client", () => ({
  DriveError: mocks.DriveError,
  isDriveConfigured: mocks.isDriveConfigured,
  uploadEpub: mocks.uploadEpub,
  deleteDriveFile: mocks.deleteDriveFile,
}));

const SESSION_USER = { id: "user-1" };

const ROW = {
  id: "item-1",
  user_id: "user-1",
  title: "Leviathan Wakes",
  description: "A blurb that theque holds.",
  structured: { authors: ["James S. A. Corey"], series: "The Expanse", series_index: 1 },
  file_drive_id: null as string | null,
  file_name: null as string | null,
  file_bytes: null as number | null,
  file_sha256: null as string | null,
  file_uploaded_at: null as string | null,
};

const FILE_COLUMNS = [
  "file_drive_id",
  "file_name",
  "file_bytes",
  "file_sha256",
  "file_uploaded_at",
];

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const OPF = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:1234</dc:identifier>
    <dc:title>Old Title</dc:title>
    <dc:creator>Old Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:description>Old blurb.</dc:description>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

async function buildEpub(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file("OEBPS/content.opf", OPF);
  zip.file("OEBPS/ch1.xhtml", "<html><body><p>Chapter one.</p></body></html>");
  return zip.generateAsync({ type: "uint8array" });
}

async function buildPlainZip(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("hello.txt", "not a book");
  return zip.generateAsync({ type: "uint8array" });
}

function itemsTable(opts: {
  row: Record<string, unknown> | null;
  loadError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: opts.row, error: opts.loadError ?? null }),
    update: mocks.updateSpy.mockImplementation(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: opts.updateError ?? null }),
      }),
    })),
  };
}

function useRow(opts: {
  row: Record<string, unknown> | null;
  loadError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const table = itemsTable(opts);
  mocks.from.mockImplementation((table_: string) => {
    if (table_ !== "items") throw new Error(`Unexpected table ${table_}`);
    return table;
  });
  return table;
}

function uploadRequest(body: BodyInit, headers?: Record<string, string>): Request {
  return new Request("https://theque.app/api/items/item-1/file", { method: "POST", body, headers });
}

function fileForm(bytes: Uint8Array, field = "file"): FormData {
  const form = new FormData();
  form.append(field, new File([bytes as unknown as BlobPart], "upload.epub"));
  return form;
}

const params = { params: Promise.resolve({ id: "item-1" }) };

function deleteRequest(): Request {
  return new Request("https://theque.app/api/items/item-1/file", { method: "DELETE" });
}

async function loadRoute() {
  return import("./route");
}

beforeEach(() => {
  vi.resetModules();
  mocks.getSessionUserOrNull.mockReset();
  mocks.from.mockReset();
  mocks.updateSpy.mockReset();
  mocks.isDriveConfigured.mockReset();
  mocks.uploadEpub.mockReset();
  mocks.deleteDriveFile.mockReset();

  mocks.getSessionUserOrNull.mockResolvedValue(SESSION_USER);
  mocks.isDriveConfigured.mockReturnValue(true);
  mocks.uploadEpub.mockResolvedValue({ id: "drive-new", name: "stored-name.epub" });
  mocks.deleteDriveFile.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/items/[id]/file", () => {
  it("rejects a signed-out caller", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(mocks.uploadEpub).not.toHaveBeenCalled();
  });

  it("reports a missing Drive configuration before it reads the file", async () => {
    mocks.isDriveConfigured.mockReturnValue(false);
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "drive_not_configured" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("answers 404 for a missing item", async () => {
    useRow({ row: null });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("answers 404, not 403, for an item of another user", async () => {
    useRow({ row: { ...ROW, user_id: "user-2" } });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(mocks.uploadEpub).not.toHaveBeenCalled();
  });

  it("rejects a form without a file field", async () => {
    useRow({ row: ROW });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub(), "epub")), params);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing_file" });
  });

  it("rejects an oversized body from the declared length", async () => {
    useRow({ row: ROW });
    const { POST } = await loadRoute();

    const res = await POST(
      uploadRequest("x", { "content-length": String(MAX_BOOK_FILE_BYTES * 2) }),
      params,
    );

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "file_too_large" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects bytes that are not a zip file", async () => {
    useRow({ row: ROW });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(new Uint8Array([1, 2, 3, 4, 5]))), params);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid_epub" });
    expect(mocks.uploadEpub).not.toHaveBeenCalled();
  });

  it("rejects a zip file that is not an EPUB", async () => {
    useRow({ row: ROW });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildPlainZip())), params);

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid_epub" });
    expect(mocks.uploadEpub).not.toHaveBeenCalled();
  });

  it("writes the item metadata into the file, uploads it, and records five columns", async () => {
    useRow({ row: ROW });
    const source = await buildEpub();
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(source)), params);

    expect(res.status).toBe(200);

    const upload = mocks.uploadEpub.mock.calls[0][0] as { name: string; bytes: Uint8Array };
    expect(upload.name).toBe("James S. A. Corey - Leviathan Wakes (The Expanse 01).epub");

    const written = await readEpubMetadata(upload.bytes);
    expect(written.title).toBe("Leviathan Wakes");
    expect(written.creators).toEqual(["James S. A. Corey"]);
    expect(written.description).toBe("A blurb that theque holds.");
    expect(written.series).toBe("The Expanse");
    expect(written.seriesIndex).toBe(1);

    expect(mocks.updateSpy).toHaveBeenCalledTimes(1);
    const patch = mocks.updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual([...FILE_COLUMNS].sort());
    expect(patch.file_drive_id).toBe("drive-new");
    expect(patch.file_name).toBe("stored-name.epub");
    expect(patch.file_bytes).toBe(upload.bytes.byteLength);
    // The digest describes the uploaded bytes, not the bytes the browser sent.
    expect(patch.file_sha256).toBe(createHash("sha256").update(upload.bytes).digest("hex"));
    expect(patch.file_sha256).not.toBe(createHash("sha256").update(source).digest("hex"));
    expect(patch.file_sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(await res.json()).toEqual({
      file: {
        name: "stored-name.epub",
        bytes: upload.bytes.byteLength,
        uploaded_at: patch.file_uploaded_at,
      },
    });
    expect(new Date(patch.file_uploaded_at as string).toISOString()).toBe(patch.file_uploaded_at);
  });

  it("uploads the replacement before it deletes the old Drive file", async () => {
    useRow({ row: { ...ROW, file_drive_id: "drive-old" } });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(200);
    expect(mocks.deleteDriveFile).toHaveBeenCalledWith("drive-old");
    const uploadOrder = mocks.uploadEpub.mock.invocationCallOrder[0];
    const updateOrder = mocks.updateSpy.mock.invocationCallOrder[0];
    const deleteOrder = mocks.deleteDriveFile.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(updateOrder);
    expect(updateOrder).toBeLessThan(deleteOrder);
  });

  it("keeps the old file when the delete of the old file fails", async () => {
    useRow({ row: { ...ROW, file_drive_id: "drive-old" } });
    mocks.deleteDriveFile.mockRejectedValue(new mocks.DriveError("delete_failed", "Drive refused.", 500));
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(200);
  });

  it("reports a failed upload without the Drive message", async () => {
    useRow({ row: ROW });
    mocks.uploadEpub.mockRejectedValue(
      new mocks.DriveError("upload_failed", "Drive refused the upload.", 403),
    );
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upload_failed" });
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });

  it("removes the new Drive file when the row update fails", async () => {
    useRow({ row: ROW, updateError: { message: "constraint" } });
    const { POST } = await loadRoute();

    const res = await POST(uploadRequest(fileForm(await buildEpub())), params);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upload_failed" });
    expect(mocks.deleteDriveFile).toHaveBeenCalledWith("drive-new");
  });
});

describe("DELETE /api/items/[id]/file", () => {
  it("rejects a signed-out caller", async () => {
    mocks.getSessionUserOrNull.mockResolvedValue(null);
    const { DELETE } = await loadRoute();

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("answers 404 for an item of another user", async () => {
    useRow({ row: { ...ROW, user_id: "user-2" } });
    const { DELETE } = await loadRoute();

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("succeeds when the item has no file", async () => {
    useRow({ row: ROW });
    const { DELETE } = await loadRoute();

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ file: null });
    expect(mocks.deleteDriveFile).not.toHaveBeenCalled();
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });

  it("removes the Drive file and clears five columns", async () => {
    useRow({ row: { ...ROW, file_drive_id: "drive-old", file_name: "old.epub" } });
    const { DELETE } = await loadRoute();

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ file: null });
    expect(mocks.deleteDriveFile).toHaveBeenCalledWith("drive-old");
    expect(mocks.updateSpy).toHaveBeenCalledTimes(1);
    expect(mocks.updateSpy.mock.calls[0][0]).toEqual({
      file_drive_id: null,
      file_name: null,
      file_bytes: null,
      file_sha256: null,
      file_uploaded_at: null,
    });
  });

  it("keeps the columns when Drive refuses the delete", async () => {
    useRow({ row: { ...ROW, file_drive_id: "drive-old" } });
    mocks.deleteDriveFile.mockRejectedValue(
      new mocks.DriveError("delete_failed", "Drive refused the delete.", 500),
    );
    const { DELETE } = await loadRoute();

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "delete_failed" });
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });

  it("reports a missing Drive configuration for an attached file", async () => {
    useRow({ row: { ...ROW, file_drive_id: "drive-old" } });
    mocks.isDriveConfigured.mockReturnValue(false);
    const { DELETE } = await loadRoute();

    const res = await DELETE(deleteRequest(), params);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "drive_not_configured" });
    expect(mocks.updateSpy).not.toHaveBeenCalled();
  });
});
