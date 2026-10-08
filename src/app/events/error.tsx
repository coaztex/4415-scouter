"use client";
import Link from "next/link";
import { Button, buttonStyles } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
export default function EventError({ reset }: { reset: () => void }) {
  return (
    <ErrorState
      title="Workspace unavailable"
      description="Check your connection and retry. If this continues, contact an administrator."
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
