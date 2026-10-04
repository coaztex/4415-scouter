"use client";
import { useActionState } from "react";
import { eventImportAction } from "@/features/events/server/actions";
import { Button } from "@/components/ui/button";
export function RefreshEvent({ eventKey }: { eventKey: string }) {
  const [state, action, pending] = useActionState(eventImportAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="eventKey" value={eventKey} />
      <input type="hidden" name="operation" value="sync" />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "↻ Syncing…" : "↻ Refresh from TBA"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-2 text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
