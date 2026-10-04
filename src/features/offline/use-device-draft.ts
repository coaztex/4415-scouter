"use client";
import { useEffect, useRef, useState } from "react";
import { readDraft, writeDraft, deleteDraft } from "./store";
export function useDeviceDraft(key: string, actorId: string) {
  const [initial, setInitial] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const revision = useRef(0),
    chain = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let active = true;
    void readDraft(key, actorId)
      .then((row) => {
        if (!active) return;
        revision.current = row?.revision ?? 0;
        setInitial(row?.value ?? null);
        setLoaded(true);
      })
      .catch(() => {
        if (active)
          setError(
            "Cannot read device storage. Existing data has not been overwritten. Keep this page open and export a backup.",
          );
      });
    return () => {
      active = false;
    };
  }, [key, actorId]);
  function save(value: string) {
    setSaving(true);
    const write = chain.current.then(async () => {
      revision.current = await writeDraft(
        key,
        actorId,
        value,
        revision.current,
      );
    });
    chain.current = write;
    void write.then(
      () => {
        if (chain.current === write) {
          setSaving(false);
          setError("");
        }
      },
      () => {
        setSaving(false);
        setError(
          "Device draft could not be saved or changed in another tab. Keep this page open and export a backup before reloading.",
        );
      },
    );
    return write;
  }
  async function remove() {
    await chain.current.catch(() => undefined);
    await deleteDraft(key, actorId);
    revision.current = 0;
    chain.current = Promise.resolve();
  }
  return {
    initial,
    loaded,
    error,
    saving,
    save,
    remove,
    flush: () => chain.current,
  };
}
