import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";

type FieldProps = { id: string; label: string; hint?: string; error?: string };
const controlStyles =
  "min-h-12 w-full rounded-control border border-border bg-surface px-3 py-2 text-base text-foreground placeholder:text-muted disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted";

export function Input({
  id,
  label,
  hint,
  error,
  labelAction,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> &
  FieldProps & { labelAction?: ReactNode }) {
  const description =
    [
      props["aria-describedby"],
      hint ? `${id}-hint` : "",
      error ? `${id}-error` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="space-y-2">
      {labelAction ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <label htmlFor={id} className="text-sm font-semibold">
            {label}
          </label>
          {labelAction}
        </div>
      ) : (
        <label htmlFor={id} className="block text-sm font-semibold">
          {label}
        </label>
      )}
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={description}
        className={`${controlStyles} ${className}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Select({
  id,
  label,
  hint,
  error,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const description =
    [
      props["aria-describedby"],
      hint ? `${id}-hint` : "",
      error ? `${id}-error` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <select
        {...props}
        id={id}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={description}
        className={`${controlStyles} ${className}`}
      >
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
