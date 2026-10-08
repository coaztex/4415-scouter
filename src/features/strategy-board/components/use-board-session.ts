"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useDeviceDraft } from "@/features/offline/use-device-draft";
import {
  boardDraftKey,
  boardBytes,
  MAX_BOARD_BYTES,
  MAX_BOARD_IMPORT_BYTES,
  parseBoardImport,
  boardDraftSchema,
  validateBoard,
  type BoardDocument,
} from "../model";
import type { StrategyBoardContext } from "../server/queries";
import { saveStrategyBoard } from "../server/actions";

export function useBoardSession(context: StrategyBoardContext) {
  const storage = useDeviceDraft(
    boardDraftKey(context.actorId, context.eventId, context.matchId),
    context.actorId,
  );
  const [document, setDocument] = useState(context.document);
  const [revision, setRevision] = useState(context.revision);
  const [ready, setReady] = useState(false),
    [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(""),
    [online, setOnline] = useState(true);
  const [conflict, setConflict] = useState(false);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  const past = useRef<BoardDocument[]>([]),
    future = useRef<BoardDocument[]>([]);
  const restored = useRef(false),
    inFlight = useRef(false);
  const lastCheckpoint = useRef<string | null>(null);
  const restore = useEffectEvent(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      if (storage.initial && !context.readOnly) {
        lastCheckpoint.current = storage.initial;
        const draft = boardDraftSchema.parse(JSON.parse(storage.initial));
        if (
          draft.eventId !== context.eventId ||
          draft.matchId !== context.matchId ||
          draft.matchKey !== context.matchKey
        )
          throw new Error("Draft identity mismatch");
        if (!draft.unsynced && draft.baseRevision <= context.revision) {
          setReady(true);
          return;
        }
        const data = validateBoard(
          draft.document,
          context.gameSlug,
          context.config,
          context.lineup,
        );
        // Keep stale device work visible, but block saves until the user reconciles it.
        setDocument(data);
        setRevision(draft.baseRevision);
        setDirty(JSON.stringify(data) !== JSON.stringify(context.document));
        if (draft.baseRevision !== context.revision) {
          setConflict(true);
          setMessage(
            "Saved board changed since this device draft. Export your draft, then load the saved board to reconcile.",
          );
        } else setMessage("Device draft restored.");
      }
      setReady(true);
    } catch {
      setMessage(
        "Device draft could not be read. Export it before loading the saved board.",
      );
    }
  });
  useEffect(() => {
    if (!storage.loaded) return;
    const frame = requestAnimationFrame(() => restore());
    return () => cancelAnimationFrame(frame);
  }, [storage.loaded]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const frame = requestAnimationFrame(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const checkpoint = useEffectEvent(() => {
    if (!ready || context.readOnly || !dirty || inFlight.current) return;
    const value = JSON.stringify({
      eventId: context.eventId,
      matchId: context.matchId,
      matchKey: context.matchKey,
      baseRevision: revision,
      unsynced: true,
      document,
    });
    if (lastCheckpoint.current === value) return;
    lastCheckpoint.current = value;
    void storage.save(value).catch(() => {
      if (lastCheckpoint.current === value) lastCheckpoint.current = null;
    });
  });
  // One checkpoint per committed edit, with notes debounced; never per pointer movement.
  useEffect(() => {
    if (!ready || !dirty || context.readOnly) return;
    const timer = setTimeout(() => checkpoint(), 250);
    return () => clearTimeout(timer);
  }, [document, revision, ready, dirty, context.readOnly]);
  useEffect(() => {
    const flush = () => checkpoint();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  function edit(next: BoardDocument) {
    if (!ready || context.readOnly || saving || inFlight.current) return;
    if (boardBytes(next) > MAX_BOARD_BYTES) {
      setMessage(
        "This board is near its size limit. Remove unused drawings before adding more.",
      );
      return;
    }
    past.current = [...past.current.slice(-49), document];
    future.current = [];
    setCanUndo(true);
    setCanRedo(false);
    setDocument(next);
    setDirty(true);
  }
  function undo() {
    if (!ready || context.readOnly || inFlight.current) return;
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(document);
    setCanUndo(past.current.length > 0);
    setCanRedo(true);
    setDocument(previous);
    setDirty(true);
  }
  function redo() {
    if (!ready || context.readOnly || inFlight.current) return;
    const next = future.current.pop();
    if (!next) return;
    past.current.push(document);
    setCanUndo(true);
    setCanRedo(future.current.length > 0);
    setDocument(next);
    setDirty(true);
  }
  async function save() {
    if (inFlight.current || !ready || context.readOnly || conflict) return;
    inFlight.current = true;
    setSaving(true);
    const draft = {
      eventId: context.eventId,
      matchId: context.matchId,
      matchKey: context.matchKey,
      baseRevision: revision,
      unsynced: true,
      document,
    };
    try {
      await storage.save(JSON.stringify(draft));
      lastCheckpoint.current = JSON.stringify(draft);
      if (!navigator.onLine) {
        setMessage(
          "Offline: edits are saved on this device. Reconnect and use Save board.",
        );
        return;
      }
      const result = await saveStrategyBoard({
        eventId: context.eventId,
        matchId: context.matchId,
        expectedRevision: revision,
        document,
      });
      if (!result.ok) {
        setMessage(result.message);
        setConflict(result.kind === "conflict");
        return;
      }
      // Keep the accepted checkpoint for reload. Lost response retries safely produce a conflict.
      await storage.save(
        JSON.stringify({
          ...draft,
          baseRevision: result.revision,
          unsynced: false,
        }),
      );
      lastCheckpoint.current = JSON.stringify({
        ...draft,
        baseRevision: result.revision,
        unsynced: false,
      });
      setRevision(result.revision);
      setDirty(false);
      setMessage("Board saved.");
    } catch {
      setMessage(
        "Save was not confirmed. Keep this page open and export your draft; retry Save board.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  async function importDraft(file: File) {
    if (inFlight.current || !ready || context.readOnly) return;
    inFlight.current = true;
    setSaving(true);
    try {
      if (file.size > MAX_BOARD_IMPORT_BYTES)
        throw new Error("Draft file is too large.");
      const imported = parseBoardImport(await file.text(), context);
      if (
        !window.confirm(
          "Replace all phases on this device with the imported draft? Export your current draft first if you want a backup.",
        )
      )
        return;
      // An export's revision belongs to its source device. Rebase this explicit
      // replacement on our loaded server revision; the save RPC still checks CAS.
      const baseRevision = conflict ? context.revision : revision;
      const checkpoint = JSON.stringify({
        eventId: context.eventId,
        matchId: context.matchId,
        matchKey: context.matchKey,
        baseRevision,
        unsynced: true,
        document: imported,
      });
      await storage.save(checkpoint);
      lastCheckpoint.current = checkpoint;
      past.current = [...past.current.slice(-49), document];
      future.current = [];
      setCanUndo(true);
      setCanRedo(false);
      setDocument(imported);
      setRevision(baseRevision);
      setDirty(true);
      setConflict(false);
      setMessage(
        "Device draft imported. Use Save board to share it with other accounts and devices.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error &&
          (error.message === "Draft file is too large." ||
            error.message ===
              "This draft belongs to a different event or match.")
          ? error.message
          : "Could not import this draft. Check that it is a valid export for this match. Your current board is preserved.",
      );
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  async function loadSaved() {
    if (inFlight.current || context.readOnly) return;
    if (
      !window.confirm(
        "Discard this device draft and reload the saved board? Export a backup first.",
      )
    )
      return;
    // Block pending debounce, pagehide and unmount checkpoints while discarding.
    // Otherwise navigation can write the discarded document straight back.
    inFlight.current = true;
    setSaving(true);
    try {
      await storage.remove();
      window.location.reload();
    } catch {
      inFlight.current = false;
      setSaving(false);
      setMessage(
        "Could not clear device storage. Export your draft before reloading.",
      );
    }
  }
  function exportDraft() {
    const value =
      !ready && storage.initial
        ? storage.initial
        : JSON.stringify({
            eventId: context.eventId,
            matchId: context.matchId,
            matchKey: context.matchKey,
            baseRevision: revision,
            document,
          });
    const url = URL.createObjectURL(
      new Blob([value], { type: "application/json" }),
    );
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `${context.matchKey}-strategy.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return {
    document,
    edit,
    undo,
    redo,
    canUndo,
    canRedo,
    revision,
    ready,
    dirty,
    saving,
    message,
    online,
    conflict,
    storageError: storage.error,
    deviceSaving: storage.saving,
    save,
    loadSaved,
    importDraft,
    exportDraft,
  };
}
