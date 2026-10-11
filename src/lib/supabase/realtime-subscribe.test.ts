import { describe, expect, it, vi } from "vitest";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { subscribeWithSession } from "./realtime-subscribe";

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function makeClient(session: { access_token: string } | null) {
  const calls: string[] = [];
  const client = {
    auth: { getSession: vi.fn(async () => ({ data: { session } })) },
    realtime: {
      setAuth: vi.fn(async (token: string) => {
        calls.push(`setAuth:${token}`);
      }),
    },
    removeChannel: vi.fn(),
  };
  return { client: client as unknown as SupabaseClient, raw: client, calls };
}

describe("subscribeWithSession", () => {
  it("sets the session token before it opens the channel", async () => {
    const { client, calls } = makeClient({ access_token: "token-1" });
    const channel = {} as RealtimeChannel;
    subscribeWithSession(client, () => {
      calls.push("open");
      return channel;
    });
    await flush();
    expect(calls).toEqual(["setAuth:token-1", "open"]);
  });

  it("does not open the channel after cleanup", async () => {
    const { client } = makeClient({ access_token: "token-1" });
    const open = vi.fn(() => ({}) as RealtimeChannel);
    const cleanup = subscribeWithSession(client, open);
    cleanup();
    await flush();
    expect(open).not.toHaveBeenCalled();
  });

  it("removes the channel on cleanup", async () => {
    const { client, raw } = makeClient(null);
    const channel = {} as RealtimeChannel;
    const cleanup = subscribeWithSession(client, () => channel);
    await flush();
    cleanup();
    expect(raw.removeChannel).toHaveBeenCalledWith(channel);
    expect(raw.realtime.setAuth).not.toHaveBeenCalled();
  });

  it("stays silent when the channel throws", async () => {
    const { client } = makeClient(null);
    subscribeWithSession(client, () => {
      throw new Error("WebSocket not available");
    });
    await expect(flush()).resolves.toBeUndefined();
  });
});
