"use client";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
export default function EventError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Workspace unavailable"
      description="We could not load this workspace. Check your connection and try again. If this continues, ask an administrator to check account access and database setup."
      action={
        <div className="flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Link href="/events" className={buttonStyles("secondary")}>
            All events
          </Link>
        </div>
      }
    />
  );
}
