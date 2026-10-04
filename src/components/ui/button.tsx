import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

export function buttonStyles(variant: Variant = "primary") {
  return `touch-pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variant === "primary" ? "bg-brand-primary text-on-brand-primary hover:bg-brand-primary-hover" : "border border-border bg-surface text-foreground hover:bg-surface-subtle"}`;
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`${buttonStyles(variant)} ${className}`}
      {...props}
    />
  );
}
