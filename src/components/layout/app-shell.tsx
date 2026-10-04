import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/server";
import { SyncProvider } from "@/features/offline/sync-provider";
import { PwaRegistration } from "./pwa-registration";
import { WorkspaceShell } from "./workspace-shell";

export async function AppShell({ children }: { children: ReactNode }) {
  const context = await requireRole("scout").catch(() => null);
  return (
    <SyncProvider
      key={context?.profile.id ?? "signed-out"}
      actorId={context?.profile.id ?? null}
    >
      <PwaRegistration />
      <WorkspaceShell role={context?.profile.role} signedIn={!!context}>
        {children}
      </WorkspaceShell>
    </SyncProvider>
  );
}
