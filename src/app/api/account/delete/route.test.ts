import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getVerifiedSessionUserOrNull: vi.fn(),
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth/session-user", () => ({
  getVerifiedSessionUserOrNull: mocks.getVerifiedSessionUserOrNull,
}));

vi.mock("@/lib/account/delete-account", () => ({
  deleteAccount: mocks.deleteAccount,
}));

vi.mock("@/lib/drive/client", () => ({
  deleteDriveFile: vi.fn(),
  isDriveConfigured: () => false,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: vi.fn() },
    auth: { admin: { deleteUser: vi.fn() } },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signOut: mocks.signOut },
  }),
}));

function req(body: unknown) {
  return new Request("https://theque.app/api/account/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    mocks.getVerifiedSessionUserOrNull.mockReset();
    mocks.deleteAccount.mockReset();
    mocks.signOut.mockReset();
  });

  it("rejects without a valid session", async () => {
    mocks.getVerifiedSessionUserOrNull.mockResolvedValue(null);

    const { POST } = await import("./route");
    const res = await POST(req({ confirm: "delete" }));

    expect(res.status).toBe(401);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("rejects when confirm is not exactly \"delete\"", async () => {
    mocks.getVerifiedSessionUserOrNull.mockResolvedValue({ id: "user-1" });

    const { POST } = await import("./route");

    for (const confirm of ["Delete", "DELETE", "delete ", "", undefined, null, 123]) {
      const res = await POST(req({ confirm }));
      expect(res.status).toBe(400);
    }
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("resolves identity from the session and never from the request body", async () => {
    mocks.getVerifiedSessionUserOrNull.mockResolvedValue({ id: "real-user-id" });
    mocks.deleteAccount.mockResolvedValue({ ok: true, orphanedFileCount: 0 });

    const { POST } = await import("./route");
    const res = await POST(
      req({ confirm: "delete", userId: "attacker-controlled-id", id: "attacker-controlled-id" }),
    );

    expect(res.status).toBe(200);
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAccount.mock.calls[0][0]).toBe("real-user-id");
    expect(mocks.deleteAccount.mock.calls[0][0]).not.toBe("attacker-controlled-id");
  });

  it("signs the user out and reports the orphaned-file count on success", async () => {
    mocks.getVerifiedSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.deleteAccount.mockResolvedValue({ ok: true, orphanedFileCount: 2, orphanedDriveFileCount: 0 });

    const { POST } = await import("./route");
    const res = await POST(req({ confirm: "delete" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true, orphanedFileCount: 2, orphanedDriveFileCount: 0 });
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("returns 500 and does not sign out when the orchestration reports failure", async () => {
    mocks.getVerifiedSessionUserOrNull.mockResolvedValue({ id: "user-1" });
    mocks.deleteAccount.mockResolvedValue({ ok: false, orphanedFileCount: 0 });

    const { POST } = await import("./route");
    const res = await POST(req({ confirm: "delete" }));

    expect(res.status).toBe(500);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("rejects an unparseable body once a session exists", async () => {
    mocks.getVerifiedSessionUserOrNull.mockResolvedValue({ id: "user-1" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://theque.app/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });
});
