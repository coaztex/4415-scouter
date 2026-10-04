"use client";
import { useEffect, useRef, useState } from "react";
import { useDeviceDraft } from "@/features/offline/use-device-draft";
import { useSync } from "@/features/offline/sync-provider";
import {
  draftKey,
  recoverDraft,
  type MatchDraft,
  type CaptureIdentity,
} from "./model";
export function downloadDraft(raw: string) {
  const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = "match-scouting-draft.json";
  link.click();
  URL.revokeObjectURL(url);
}
export function useMatchDraft(identity: CaptureIdentity) {
  const key = draftKey(identity),
    current = useRef<MatchDraft | null>(null);
  const storage = useDeviceDraft(key, identity.actorId),
    sync = useSync();
  const [draft, setDraft] = useState<MatchDraft | null>(null),
    [loaded, setLoaded] = useState(false),
    [recovery, setRecovery] = useState(false),
    [blocked, setBlocked] = useState<string | null>(null),
    [raw, setRaw] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const clock = useRef<{ wall: number; mono: number } | null>(null);
  useEffect(() => {
    if (!storage.loaded || !sync.loaded) return;
    const frame = requestAnimationFrame(() => {
      let value: string | null = null;
      try {
        const queued = sync.rows.some((row) => row.draftKey === key);
        value = storage.initial ?? (queued ? null : localStorage.getItem(key));
        if (value && !storage.initial && !queued) {
          void storage
            .save(value)
            .then(() => localStorage.removeItem(key))
            .catch(() => undefined);
        }
      } catch {
        // IndexedDB remains usable when legacy localStorage is unavailable.
      }
      try {
        if (value) {
          setRaw(value);
          const restored = recoverDraft(value, identity);
          current.current = restored;
          setDraft(restored);
          setRecovery(true);
        }
      } catch {
        setBlocked(
          "The saved draft cannot be safely loaded for this assignment. Download it for review before explicitly discarding it. It has not been overwritten.",
        );
      }
      setLoaded(true);
      setOnline(navigator.onLine);
    });
    const status = () => setOnline(navigator.onLine);
    window.addEventListener("online", status);
    window.addEventListener("offline", status);
    const leaving = (e: BeforeUnloadEvent) => {
      if (current.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    // A second tab must not silently replace this tab's draft.
    const otherTab = (e: StorageEvent) => {
      if (e.key === key)
        setBlocked(
          "This draft changed in another tab. Download this tab's copy, then reload to review the saved draft. Do not keep editing both copies.",
        );
    };
    window.addEventListener("storage", otherTab);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("online", status);
      window.removeEventListener("offline", status);
      window.removeEventListener("beforeunload", leaving);
      window.removeEventListener("storage", otherTab);
    };
    // Identity fields are fixed for this keyed assignment route; key changes remount it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storage.loaded, sync.loaded]);
  function change(update: (d: MatchDraft) => MatchDraft) {
    if (!current.current || blocked) return;
    write(update(current.current));
  }
  function write(next: MatchDraft) {
    current.current = next;
    setDraft(next);
    void storage.save(JSON.stringify(next)).catch(() => undefined);
  }
  function now() {
    const wall = Date.now(),
      mono = performance.now(),
      previous = clock.current;
    clock.current = { wall, mono };
    if (
      previous &&
      Math.abs(wall - previous.wall - (mono - previous.mono)) > 2000 &&
      current.current?.phase !== "post"
    ) {
      change((d) => ({
        ...d,
        timingFault:
          "Device time changed or the device slept. Timing needs review; the draft is preserved.",
      }));
    }
    return wall;
  }
  function clear() {
    void storage.remove().catch(() => undefined);
    try {
      localStorage.removeItem(key);
    } catch {
      // A storage failure must never discard the in-memory draft or block exit.
    }
    current.current = null;
    setDraft(null);
    setRecovery(false);
    setBlocked(null);
    setRaw(null);
  }
  return {
    draft,
    loaded,
    recovery,
    setRecovery,
    blocked,
    raw,
    storageError: storage.error,
    saving: storage.saving,
    flush: storage.flush,
    online,
    change,
    write,
    now,
    clear,
    current,
  };
}
