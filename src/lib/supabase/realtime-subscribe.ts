import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

/**
 * Opens a Realtime channel after the socket has the session token.
 *
 * A channel join without the token runs as `anon`. RLS then drops every
 * `postgres_changes` event for the user's rows, and the channel stays silent.
 * The browser client loads its session asynchronously, so a join directly
 * after `createClient()` can win that race.
 *
 * Returns a cleanup function that removes the channel. Failures are silent:
 * Realtime is progressive enhancement, and the pages still load through REST.
 */
export function subscribeWithSession(
  supabase: SupabaseClient,
  open: () => RealtimeChannel,
): () => void {
  let cancelled = false;
  let channel: RealtimeChannel | undefined;

  void supabase.auth
    .getSession()
    .then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = open();
    })
    .catch(() => {
      // Progressive enhancement: no channel, REST still works.
    });

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
