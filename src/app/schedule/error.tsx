"use client";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Schedule unavailable"
      description="Check the connection and scheduling migrations, then retry."
      action={<Button onClick={reset}>Retry</Button>}
    />
  );
}
