import type { ReactNode } from "react";
import { Card } from "./card";

type StateProps = { title: string; description?: string; action?: ReactNode };

export function EmptyState({ title, description, action }: StateProps) {
  return (
    <Card className="flex flex-col items-center justify-center text-center">
      <h2 className="text-xl font-bold">{title}</h2>
      {description && <p className="mt-2 max-w-md text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}

export function ErrorState({ title, description, action }: StateProps) {
  return (
    <Card>
      <div role="alert">
        <h2 className="text-xl font-bold text-danger">{title}</h2>
        {description && <p className="mt-3 text-muted">{description}</p>}
      </div>
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function LoadingState({
  label = "Loading workspace…",
}: {
  label?: string;
}) {
  return (
    <Card>
      <p role="status" aria-live="polite" className="font-semibold">
        {label}
      </p>
      <div
        aria-hidden="true"
        className="mt-5 h-2 w-32 rounded-full bg-accent-soft"
      />
    </Card>
  );
}
