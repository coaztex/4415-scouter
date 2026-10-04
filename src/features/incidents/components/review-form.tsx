"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/fields";
import { confirmIncident } from "../server/actions";

export function ReviewForm({
  eventKey,
  incidentId,
}: {
  eventKey: string;
  incidentId: string;
}) {
  const [source, setSource] = useState(""),
    [cause, setCause] = useState(""),
    [evidence, setEvidence] = useState(""),
    [acknowledged, setAcknowledged] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const result = await confirmIncident({
      eventKey,
      incidentId,
      source,
      cause,
      evidence,
    });
    setPending(false);
    if (result.ok) {
      setMessage("Cause confirmed and saved with its evidence source.");
      router.refresh();
    } else setMessage(result.message ?? "Confirmation was not saved.");
  }
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="mt-4 space-y-3 rounded-control border border-border bg-background p-4"
    >
      <h3 className="font-bold">Add later confirmed cause</h3>
      <p className="text-sm text-muted">
        Record only a cause supported by a team conversation or strategy review.
        The scout observation stays unchanged. This confirmation cannot be
        casually edited.
      </p>
      <Select
        id={`source-${incidentId}`}
        label="Evidence source"
        value={source}
        required
        onChange={(event) => setSource(event.target.value)}
      >
        <option value="">Choose a source</option>
        <option value="team_confirmed">Team-confirmed</option>
        <option value="strategy_confirmed">Strategy-confirmed</option>
        <option value="other">Other documented source</option>
      </Select>
      <div>
        <label
          htmlFor={`cause-${incidentId}`}
          className="block text-sm font-bold"
        >
          Confirmed cause
        </label>
        <input
          id={`cause-${incidentId}`}
          className="mt-2 min-h-12 w-full rounded-control border border-border bg-surface px-3"
          maxLength={500}
          required
          value={cause}
          onChange={(event) => setCause(event.target.value)}
        />
      </div>
      <div>
        <label
          htmlFor={`evidence-${incidentId}`}
          className="block text-sm font-bold"
        >
          How was it confirmed?
        </label>
        <textarea
          id={`evidence-${incidentId}`}
          className="mt-2 w-full rounded-control border border-border bg-surface p-3"
          rows={2}
          maxLength={1000}
          required
          value={evidence}
          onChange={(event) => setEvidence(event.target.value)}
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="mt-1 size-5"
        />
        <span>
          I reviewed the evidence source. This cause will be saved separately
          from the scout observation and cannot be casually changed.
        </span>
      </label>
      <Button
        type="submit"
        disabled={
          pending ||
          !source ||
          !cause.trim() ||
          !evidence.trim() ||
          !acknowledged
        }
      >
        {pending ? "Saving…" : "Save confirmed cause"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
