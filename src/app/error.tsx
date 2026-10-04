"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="We couldn't load this page"
      description="Try again, or return to Events using the navigation above."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
