import type { HTMLAttributes } from "react";

export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-border/75 bg-surface p-4 sm:p-5 ${className}`}
      {...props}
    />
  );
}
