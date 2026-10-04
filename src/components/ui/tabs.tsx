"use client";

import { useId, useRef, useState, type ReactNode } from "react";

type TabItem = { id: string; label: string; content: ReactNode };

/** Items must have unique, stable IDs. Tabs use automatic keyboard activation. */
export function Tabs({
  label,
  items,
  initialTab,
}: {
  label: string;
  items: readonly TabItem[];
  initialTab?: string;
}) {
  const prefix = useId();
  const [selected, setSelected] = useState(
    initialTab && items.some((item) => item.id === initialTab)
      ? initialTab
      : items[0]?.id,
  );
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = items.some((item) => item.id === selected)
    ? selected
    : items[0]?.id;
  if (!items.length) return null;

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-2 overflow-x-auto border-b border-border pb-2"
      >
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${item.id}`}
            aria-controls={`${prefix}-panel-${item.id}`}
            aria-selected={active === item.id}
            tabIndex={active === item.id ? 0 : -1}
            className={`min-h-12 shrink-0 rounded-control px-4 py-3 text-sm font-semibold ${active === item.id ? "bg-brand-primary text-on-brand-primary" : "text-muted hover:bg-surface-subtle hover:text-foreground"}`}
            onClick={() => setSelected(item.id)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % items.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + items.length) % items.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = items.length - 1;
              else return;
              event.preventDefault();
              setSelected(items[next].id);
              refs.current[next]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${prefix}-panel-${item.id}`}
          aria-labelledby={`${prefix}-tab-${item.id}`}
          hidden={active !== item.id}
          tabIndex={0}
          className="pt-6"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
