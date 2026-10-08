import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type PitPresenceSnapshot = {
  activeTeams: number[];
  otherTeams: number[];
  available: boolean;
};
type Client = Pick<SupabaseClient, "channel" | "removeChannel">;
export const emptyPitPresence: PitPresenceSnapshot = {
  activeTeams: [],
  otherTeams: [],
  available: false,
};
const removals = new WeakMap<Client, Map<string, Promise<void>>>();

export function pitPresenceSnapshot(
  state: ReturnType<RealtimeChannel["presenceState"]>,
  ownKey: string,
): PitPresenceSnapshot {
  const active = new Set<number>(),
    others = new Set<number>();
  for (const [key, entries] of Object.entries(state)) {
    for (const entry of entries) {
      const number = (entry as unknown as { teamNumber?: unknown }).teamNumber;
      if (
        typeof number !== "number" ||
        !Number.isSafeInteger(number) ||
        number <= 0
      )
        continue;
      active.add(number);
      if (key !== ownKey) others.add(number);
    }
  }
  return {
    activeTeams: [...active].sort((a, b) => a - b),
    otherTeams: [...others].sort((a, b) => a - b),
    available: true,
  };
}

/** Event-scoped, advisory activity only. No submission or claim writes. */
export function connectPitPresence(
  client: Client,
  eventId: string,
  teamNumber: number | null,
  update: (state: PitPresenceSnapshot) => void,
  ownKey: string = crypto.randomUUID(),
) {
  let disposed = false,
    connected = false,
    visible = true;
  const topic = `pit-presence:${eventId}`;
  let channel: RealtimeChannel | undefined;
  let pending = removals.get(client);
  if (!pending) {
    pending = new Map();
    removals.set(client, pending);
  }
  const priorRemoval = pending.get(topic) ?? Promise.resolve();
  const publish = () => {
    if (!disposed && connected && channel)
      update(pitPresenceSnapshot(channel.presenceState(), ownKey));
  };
  const tracking = () => {
    if (!channel || !connected || disposed || teamNumber === null) return;
    const task = visible ? channel.track({ teamNumber }) : channel.untrack();
    void task
      .then((result) => {
        if (!disposed && result !== "ok") update(emptyPitPresence);
      })
      .catch(() => {
        if (!disposed) update(emptyPitPresence);
      });
  };
  // Supabase reuses channels by topic. Wait for the previous route's removal,
  // including Strict Mode cleanup, before joining the same event topic again.
  void priorRemoval
    .then(() => {
      if (disposed) return;
      channel = client.channel(topic, {
        config: { private: true, presence: { key: ownKey } },
      });
      channel.on("presence", { event: "sync" }, publish).subscribe((status) => {
        if (disposed) return;
        connected = status === "SUBSCRIBED";
        if (connected) {
          publish();
          tracking();
        } else update(emptyPitPresence);
      });
    })
    .catch(() => {
      if (!disposed) update(emptyPitPresence);
    });
  return {
    visibility(value: boolean) {
      visible = value;
      tracking();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // Remove even if untracking fails; a late subscribe must never re-track.
      const removal = priorRemoval
        .then(async () => {
          if (!channel) return;
          await channel.untrack({ timeout: 1000 }).catch(() => undefined);
          await client.removeChannel(channel).catch(() => undefined);
          channel.teardown();
        })
        .catch(() => undefined);
      pending.set(topic, removal);
      void removal.then(() => {
        if (pending.get(topic) === removal) pending.delete(topic);
      });
    },
  };
}
