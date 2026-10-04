"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { finishBreakAction } from "../server/actions";
import { ScheduleFeedback } from "./feedback";
export function FinishBreak({ id }: { id: string }) {
  const [state, action, pending] = useActionState(finishBreakAction, {});
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Finish break"}
      </Button>
      <ScheduleFeedback state={state} />
    </form>
  );
}
