import type { ReactNode } from "react";
import { shortEventLabel } from "@/features/events/presentation";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
  leading,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  leading?: ReactNode;
}) {
  const eyebrowLabel =
    eyebrow && eyebrow.length > 38
      ? shortEventLabel({ name: eyebrow })
      : eyebrow;
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-2xl items-center gap-4">
        {leading}
        <div className="min-w-0">
          {eyebrowLabel && (
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent"
              title={eyebrowLabel !== eyebrow ? eyebrow : undefined}
            >
              {eyebrowLabel}
            </p>
          )}
          <h1 className="break-words text-title font-semibold tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-base leading-6 text-muted">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}
