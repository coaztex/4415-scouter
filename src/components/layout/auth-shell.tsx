import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[70] -translate-y-24 rounded-control bg-foreground px-5 py-3 font-semibold text-on-foreground focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-sidebar-surface lg:border-0 lg:bg-background">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link
            href="/login"
            aria-label="EPIC Robotz Team 4415 — Sign in"
            className="inline-flex min-h-11 min-w-0 items-center lg:hidden"
          >
            <Image
              src="/icons/Logo_longv1.png"
              width={170}
              height={34}
              alt="EPIC Robotz Team 4415"
              priority
              className="h-9 w-auto max-w-full object-contain"
            />
          </Link>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="px-4 py-8 sm:px-8 sm:py-10"
      >
        {children}
      </main>
    </div>
  );
}
