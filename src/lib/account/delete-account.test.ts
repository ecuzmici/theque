import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  deleteAccount,
  type AdminAuthClient,
  type StorageClient,
  type StorageEntry,
} from "./delete-account";

/** Fake storage backed by an in-memory map of path -> file names present directly under it. */
function makeFakeStorage(
  files: Record<string, string[]>,
  opts?: { removeError?: boolean; folderPaths?: string[] },
) {
  const store = new Map<string, string[]>();
  for (const [path, names] of Object.entries(files)) {
    store.set(path, [...names]);
  }
  const folderPaths = new Set(opts?.folderPaths ?? []);

  const listCalls: string[] = [];
  const removeCalls: string[][] = [];

  const bucket = {
    list: vi.fn(async (path: string, options: { limit: number; offset: number }) => {
      listCalls.push(path);
      const names = store.get(path) ?? [];
      const page = names.slice(0, options.limit);
      const data: StorageEntry[] = page.map((name) => ({
        name,
        id: folderPaths.has(`${path}${name}/`) ? null : `${path}${name}`,
      }));
      return { data, error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      removeCalls.push(paths);
      if (opts?.removeError) {
        return { data: null, error: { message: "remove failed" } };
      }
      for (const [path, names] of store.entries()) {
        store.set(
          path,
          names.filter((name) => !paths.includes(`${path}${name}`)),
        );
      }
      return { data: null, error: null };
    }),
  };

  const storage: StorageClient = { from: vi.fn(() => bucket) };

  return { storage, bucket, listCalls, removeCalls };
}

function makeFakeAdminAuth(opts?: { deleteError?: boolean }) {
  const deleteUser = vi.fn(async () => {
    if (opts?.deleteError) {
      return { data: null, error: { message: "delete failed" } };
    }
    return { data: null, error: null };
  });
  const adminAuth: AdminAuthClient = { deleteUser };
  return { adminAuth, deleteUser };
}

describe("deleteAccount", () => {
  it("purges storage strictly before deleting the user (call order)", async () => {
    const { storage, bucket } = makeFakeStorage({ "user-1/": ["a.jpg", "b.jpg"] });
    const { adminAuth, deleteUser } = makeFakeAdminAuth();

    const order: string[] = [];
    const originalList = bucket.list.getMockImplementation()!;
    const originalRemove = bucket.remove.getMockImplementation()!;
    bucket.list.mockImplementation(async (...args: Parameters<typeof originalList>) => {
      order.push("list");
      return originalList(...args);
    });
    bucket.remove.mockImplementation(async (...args: Parameters<typeof originalRemove>) => {
      order.push("remove");
      return originalRemove(...args);
    });
    deleteUser.mockImplementation(async () => {
      order.push("deleteUser");
      return { data: null, error: null };
    });

    const result = await deleteAccount("user-1", { storage, adminAuth });

    expect(result.ok).toBe(true);
    expect(result.orphanedFileCount).toBe(0);
    expect(order).toEqual(["list", "remove", "deleteUser"]);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("fully drains a prefix with more than 100 objects across multiple rounds", async () => {
    const names = Array.from({ length: 250 }, (_, i) => `file-${i}.jpg`);
    const { storage, listCalls, removeCalls } = makeFakeStorage({ "user-1/": names });
    const { adminAuth, deleteUser } = makeFakeAdminAuth();

    const result = await deleteAccount("user-1", { storage, adminAuth });

    expect(result.ok).toBe(true);
    expect(result.orphanedFileCount).toBe(0);
    // 250 objects at 100/page: 100 + 100 + 50 -> 3 rounds (last page is short, so draining stops there).
    expect(listCalls.length).toBe(3);
    expect(removeCalls.length).toBe(3);
    expect(removeCalls.flat().length).toBe(250);
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("still deletes the user and reports an orphaned-file count on partial purge failure", async () => {
    const { storage } = makeFakeStorage(
      { "user-1/": ["a.jpg", "b.jpg", "c.jpg"] },
      { removeError: true },
    );
    const { adminAuth, deleteUser } = makeFakeAdminAuth();

    const result = await deleteAccount("user-1", { storage, adminAuth });

    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(result.ok).toBe(true);
    expect(result.orphanedFileCount).toBe(3);
  });

  it("recurses into nested item folders and removes their files", async () => {
    const { storage, removeCalls } = makeFakeStorage(
      {
        "user-1/": ["item-a", "item-b"],
        "user-1/item-a/": ["cover.jpg"],
        "user-1/item-b/": ["cover.png"],
      },
      { folderPaths: ["user-1/item-a/", "user-1/item-b/"] },
    );
    const { adminAuth, deleteUser } = makeFakeAdminAuth();

    const result = await deleteAccount("user-1", { storage, adminAuth });

    expect(result.orphanedFileCount).toBe(0);
    expect(removeCalls.flat()).toEqual(
      expect.arrayContaining(["user-1/item-a/cover.jpg", "user-1/item-b/cover.png"]),
    );
    expect(deleteUser).toHaveBeenCalledWith("user-1");
  });

  it("reports ok: false when deleteUser itself fails", async () => {
    const { storage } = makeFakeStorage({ "user-1/": [] });
    const { adminAuth } = makeFakeAdminAuth({ deleteError: true });

    const result = await deleteAccount("user-1", { storage, adminAuth });

    expect(result.ok).toBe(false);
  });
});
