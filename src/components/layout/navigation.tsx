"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { ProfileRole } from "@/types/database";

export type WorkspaceRole = ProfileRole;
export type NavigationItem = {
  href: string;
  label: string;
  roles?: readonly WorkspaceRole[];
};

// Role filtering is presentation only. Server authorization and RLS enforce access.
export function Navigation({
  items,
  role,
}: {
  items: readonly NavigationItem[];
  role?: WorkspaceRole;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-wrap gap-1">
      {items
        .filter(
          (item) =>
            !item.roles || (role !== undefined && item.roles.includes(role)),
        )
        .map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-12 items-center rounded-control px-3 py-3 text-sm font-semibold ${active ? "bg-brand-primary text-on-brand-primary" : "text-muted hover:bg-surface-subtle hover:text-foreground"}`}
            >
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}
