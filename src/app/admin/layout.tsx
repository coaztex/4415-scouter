import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireRole, AuthorizationError } from "@/lib/auth/server";
import { Navigation } from "@/components/layout/navigation";
import { ErrorState } from "@/components/ui/states";
export const maxDuration = 120;
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requireRole("admin");
  } catch (error) {
    if (error instanceof AuthorizationError && error.status === 401)
      redirect("/login");
    return (
      <ErrorState
        title="Access denied"
        description="An active administrator account is required."
      />
    );
  }
  return (
    <>
      <div className="mb-8">
        <Navigation
          items={[
            { href: "/admin/events", label: "Events" },
            { href: "/admin/users", label: "Users" },
            { href: "/admin/scheduling", label: "Scout Scheduling" },
            { href: "/admin/sync", label: "Data & Sync" },
            { href: "/admin/health", label: "Competition Readiness" },
          ]}
        />
      </div>
      {children}
    </>
  );
}
