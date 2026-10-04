"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addTeamNote } from "../server/actions";
export function NoteForm({
  eventId,
  eventKey,
  teamNumber,
}: {
  eventId: string;
  eventKey: string;
  teamNumber: number;
}) {
  const [note, setNote] = useState(""),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    router = useRouter();
  async function submit() {
    setPending(true);
    setMessage("");
    const result = await addTeamNote({ eventId, eventKey, teamNumber, note });
    setPending(false);
    if (result.ok) {
      setNote("");
      setMessage("Note saved.");
      router.refresh();
    } else setMessage(result.message ?? "Note not saved.");
  }
  return (
    <div className="space-y-3">
      <label htmlFor="team-note" className="block font-bold">
        Add strategy note
      </label>
      <textarea
        id="team-note"
        rows={3}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-control border border-border bg-surface p-3"
      />
      <Button disabled={pending || !note.trim()} onClick={() => void submit()}>
        {pending ? "Saving…" : "Add note"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
