/**
 * Tests for POST /api/recommend/outcomes
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserOrNull: vi.fn(),
}));

const mocks = vi.hoisted(() => ({
  outcomesSelect: vi.fn(),
  outcomesUpdate: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: mocks.from,
  }),
}));

import { getSessionUserOrNull } from "@/lib/auth/session-user";
import { POST } from "@/app/api/recommend/outcomes/route";

const SAMPLE_USER = { id: "user-123", email: "test@example.com" };
const OUTCOME_ID = "outcome-uuid-1";

function mockSupabase(options: {
  existingRow?: { id: string; user_id: string; outcome: string } | null;
  lookupError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const {
    existingRow = { id: OUTCOME_ID, user_id: SAMPLE_USER.id, outcome: "shown" },
    lookupError = null,
    updateError = null,
  } = options;

  // Row is found iff existingRow is not null
  mocks.outcomesSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({
          data: existingRow ? { id: existingRow.id } : null,
          error: lookupError,
        }),
      }),
    }),
  });

  // UPDATE chain: .update(payload).eq(id).eq(userId).eq("outcome","shown").select("id")
  // Returns 1 matched row if existingRow.outcome==="shown", else 0 rows (concurrent act)
  const updateMatchesRow = existingRow?.outcome === "shown";
  const updateData = updateMatchesRow ? [{ id: OUTCOME_ID }] : [];
  const selectMock = vi.fn().mockResolvedValue({ data: updateData, error: updateError });
  const eq3Mock = vi.fn().mockReturnValue({ select: selectMock });
  const eq2Mock = vi.fn().mockReturnValue({ eq: eq3Mock });
  const eq1Mock = vi.fn().mockReturnValue({ eq: eq2Mock });
  mocks.outcomesUpdate.mockReturnValue({ eq: eq1Mock });

  mocks.from.mockImplementation((table: string) => {
    if (table === "recommendation_outcomes") {
      return {
        select: mocks.outcomesSelect,
        update: mocks.outcomesUpdate,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/recommend/outcomes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSessionUserOrNull).mockResolvedValue(null);
});

describe("POST /api/recommend/outcomes", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await POST(makeRequest({ outcomeId: OUTCOME_ID, outcome: "saved" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when outcome is shown", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({});

    const res = await POST(makeRequest({ outcomeId: OUTCOME_ID, outcome: "shown" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when outcomeId does not exist for the user", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({ existingRow: null });

    const res = await POST(
      makeRequest({ outcomeId: OUTCOME_ID, outcome: "saved" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 500 when the outcome lookup fails", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({ lookupError: { message: "db down" } });

    const res = await POST(
      makeRequest({ outcomeId: OUTCOME_ID, outcome: "saved" }),
    );
    expect(res.status).toBe(500);
  });

  it("returns 409 when the outcome was already acted on", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({
      existingRow: { id: OUTCOME_ID, user_id: SAMPLE_USER.id, outcome: "dismissed" },
    });

    const res = await POST(
      makeRequest({ outcomeId: OUTCOME_ID, outcome: "saved" }),
    );
    expect(res.status).toBe(409);
    // UPDATE is still attempted — the .eq("outcome","shown") predicate returns 0 rows → 409
    expect(mocks.outcomesUpdate).toHaveBeenCalled();
  });

  it("updates saved outcome and sets acted_at", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({});

    const res = await POST(makeRequest({ outcomeId: OUTCOME_ID, outcome: "saved" }));
    expect(res.status).toBe(200);

    expect(mocks.outcomesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "saved",
        acted_at: expect.any(String),
      }),
    );
    const updatePayload = mocks.outcomesUpdate.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty("dismiss_reason");
  });

  it("ignores dismissReason when outcome is saved", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({});

    const res = await POST(
      makeRequest({
        outcomeId: OUTCOME_ID,
        outcome: "saved",
        dismissReason: "not_my_thing",
      }),
    );
    expect(res.status).toBe(200);

    const updatePayload = mocks.outcomesUpdate.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty("dismiss_reason");
  });

  it("updates dismissed outcome and stores dismissReason", async () => {
    vi.mocked(getSessionUserOrNull).mockResolvedValue(SAMPLE_USER as never);
    mockSupabase({});

    const res = await POST(
      makeRequest({
        outcomeId: OUTCOME_ID,
        outcome: "dismissed",
        dismissReason: "not_my_thing",
      }),
    );
    expect(res.status).toBe(200);

    expect(mocks.outcomesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "dismissed",
        dismiss_reason: "not_my_thing",
        acted_at: expect.any(String),
      }),
    );
  });
});
