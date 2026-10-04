import Link from "next/link";
import { EmptyState } from "@/components/ui/states";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <h1 className="mb-6 text-title font-bold">Page not found</h1>
      <EmptyState
        title="Let's get you back to your workspace"
        description="This address does not match an available page."
        action={
          <Link href="/events" className={buttonStyles()}>
            Back to events
          </Link>
        }
      />
    </>
  );
}
