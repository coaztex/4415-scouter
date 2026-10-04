"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { saveMatchPlan } from "../server/actions";
export function PlanForm({
  eventKey,
  matchId,
  initial,
  readOnly,
}: {
  eventKey: string;
  matchId: string;
  initial: string;
  readOnly: boolean;
}) {
  const [note, setNote] = useState(initial);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function save() {
    setPending(true);
    setMessage("");
    const result = await saveMatchPlan({ eventKey, matchId, note });
    setPending(false);
    setMessage(
      result.ok ? "Plan saved." : (result.message ?? "Plan not saved."),
    );
    if (result.ok) router.refresh();
  }
  return (
    <div className="space-y-3">
      <label htmlFor="match-plan" className="block font-bold">
        Match-specific plan / notes
      </label>
      <textarea
        id="match-plan"
        rows={3}
        maxLength={2000}
        value={note}
        readOnly={readOnly}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Agree on roles, auto starts, and contingencies…"
        className="w-full rounded-control border border-border bg-surface p-3"
      />
      {!readOnly && (
        <Button disabled={pending || !note.trim()} onClick={() => void save()}>
          {pending ? "Saving…" : "Save plan"}
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
