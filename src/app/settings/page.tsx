import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole, requireUser } from "@/lib/auth/server";
import { PageHeading } from "@/components/layout/page-heading";
import { ThemeSelector } from "@/components/layout/theme-toggle";
import { SyncIndicator } from "@/features/offline/sync-provider";
import { LogoutButton } from "@/features/auth/components/logout-button";
import packageJson from "../../../package.json";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireUser().catch(() => null);
  if (!session) redirect("/login");
  const context = await requireRole("scout").catch(() => null);
  const profile = context?.profile;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading title="Settings" />
      <div className="divide-y divide-border border-y border-border">
        <section className="py-7" aria-labelledby="settings-account">
          <h2 id="settings-account" className="text-lg font-semibold">
            Account
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Display name</dt>
              <dd className="mt-1 font-medium">
                {profile?.display_name || "Team member"}
              </dd>
            </div>
            {profile?.username && (
              <div>
                <dt className="text-muted">Username</dt>
                <dd className="mt-1 font-medium">{profile.username}</dd>
              </div>
            )}
            {session.user.email && (
              <div>
                <dt className="text-muted">Email</dt>
                <dd className="mt-1 break-all font-medium">
                  {session.user.email}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted">Role</dt>
              <dd className="mt-1 font-medium capitalize">
                {profile?.role ?? "Inactive account"}
              </dd>
            </div>
          </dl>
          {profile && (
            <Link
              href="/account"
              className="mt-4 inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline"
            >
              Manage account and password →
            </Link>
          )}
        </section>
        <section className="py-7" aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="text-lg font-semibold">
            Appearance
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            Choose how this device displays the workspace.
          </p>
          <ThemeSelector />
        </section>
        <section
          id="sync"
          className="scroll-mt-8 py-7"
          aria-labelledby="settings-sync"
        >
          <h2 id="settings-sync" className="text-lg font-semibold">
            Sync & offline
          </h2>
          <p className="mt-1 text-sm text-muted">
            Device submissions stay available here until the server confirms
            them.
          </p>
          <div className="mt-3">
            <SyncIndicator />
          </div>
        </section>
        <section className="py-7" aria-labelledby="settings-about">
          <h2 id="settings-about" className="text-lg font-semibold">
            About & identity
          </h2>
          <p className="mt-2 font-semibold">EPIC Scout</p>
          <p className="text-sm text-muted">
            EPIC Robotz Team 4415 · Version {packageJson.version}
          </p>
          <p className="mt-4 text-sm text-muted">
            Team affiliation: Valley Christian Schools
          </p>
          <div className="mt-3 inline-flex max-w-full">
            <Image
              src="/icons/ValleyChristian_School_Logos_Horiz_R.png"
              width={260}
              height={140}
              alt="Valley Christian Schools"
              className="identity-logo h-auto w-full max-w-[260px] object-contain"
            />
          </div>
        </section>
        <section className="py-7" aria-labelledby="settings-signout">
          <h2 id="settings-signout" className="mb-3 text-lg font-semibold">
            Sign out
          </h2>
          <LogoutButton />
        </section>
      </div>
    </div>
  );
}
