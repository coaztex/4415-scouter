import Link from "next/link";
import type { ComponentProps } from "react";

export function InteractiveCard({
  className = "",
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link className={`interactive-card rounded-card ${className}`} {...props} />
  );
}
