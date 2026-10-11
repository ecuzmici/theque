import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deleteItemFiles } from "./delete-item-files";

function makeStorage(names: string[], opts?: { listError?: boolean; removeError?: boolean }) {
  const bucket = {
    list: vi.fn(async () =>
      opts?.listError
        ? { data: null, error: { message: "list failed" } }
        : { data: names.map((name) => ({ name, id: name })), error: null },
    ),
    remove: vi.fn(async () =>
      opts?.removeError ? { data: null, error: { message: "remove failed" } } : { data: null, error: null },
    ),
  };
  return { storage: { from: vi.fn(() => bucket) }, bucket };
}

const ITEM = { userId: "user-1", itemId: "item-1", driveId: "drive-1" };

describe("deleteItemFiles", () => {
  it("removes the cover objects of the item and its Drive file", async () => {
    const { storage, bucket } = makeStorage(["cover.jpg", "cover.webp"]);
    const deleteDriveFile = vi.fn(async () => {});

    const result = await deleteItemFiles(ITEM, { storage, deleteDriveFile });

    expect(bucket.list).toHaveBeenCalledWith("user-1/item-1/", { limit: 100, offset: 0 });
    expect(bucket.remove).toHaveBeenCalledWith(["user-1/item-1/cover.jpg", "user-1/item-1/cover.webp"]);
    expect(deleteDriveFile).toHaveBeenCalledWith("drive-1");
    expect(result).toEqual({ coverObjectsRemoved: 2, failures: 0 });
  });

  it("skips Drive when the item has no book file", async () => {
    const { storage } = makeStorage([]);
    const deleteDriveFile = vi.fn(async () => {});

    const result = await deleteItemFiles({ ...ITEM, driveId: null }, { storage, deleteDriveFile });

    expect(deleteDriveFile).not.toHaveBeenCalled();
    expect(result).toEqual({ coverObjectsRemoved: 0, failures: 0 });
  });

  it("fails open and counts each failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { storage } = makeStorage(["cover.jpg"], { removeError: true });
    const deleteDriveFile = vi.fn(async () => {
      throw new Error("drive down");
    });

    const result = await deleteItemFiles(ITEM, { storage, deleteDriveFile });

    expect(result).toEqual({ coverObjectsRemoved: 0, failures: 2 });
  });
});
