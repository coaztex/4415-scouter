"use client";
import { ErrorState } from "@/components/ui/states";
import { Button } from "@/components/ui/button";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Administration unavailable"
      description="Try again. If this continues, check your admin access and database setup."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
