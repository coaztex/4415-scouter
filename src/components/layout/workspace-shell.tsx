"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useSync } from "@/features/offline/sync-provider";
import type { ProfileRole } from "@/types/database";
import { isActiveWorkspaceLink, workspaceGroups } from "./workspace-navigation";
import { syncAttentionLabel } from "./sync-status";
import { AuthShell } from "./auth-shell";
import { isAuthPage } from "@/lib/auth/account-access";

type CurrentEvent = { key: string; label: string };
const EventContext = createContext<Dispatch<
  SetStateAction<CurrentEvent | null>
> | null>(null);

export function EventContextBridge({
  eventKey,
  label,
}: {
  eventKey: string;
  label: string;
}) {
  const setEvent = useContext(EventContext);
  useEffect(() => {
    setEvent?.({ key: eventKey, label });
    return () =>
      setEvent?.((current) => (current?.key === eventKey ? null : current));
  }, [eventKey, label, setEvent]);
  return null;
}

function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="size-5"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        d="M10 2h4l.6 2.2 1.7.7 2-.9 2.8 2.8-.9 2 .7 1.7L23 11v4l-2.2.6-.7 1.7.9 2-2.8 2.8-2-.9-1.7.7L14 24h-4l-.6-2.2-1.7-.7-2 .9-2.8-2.8.9-2-.7-1.7L1 15v-4l2.2-.6.7-1.7-.9-2L5.8 4l2 .9 1.7-.7L10 2Z"
        transform="translate(0 -1) scale(.96)"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function SyncAlert({ onNavigate }: { onNavigate?: () => void }) {
  const { rows, loaded, online, storageError } = useSync();
  const label = syncAttentionLabel({ rows, loaded, online, storageError });
  if (!label) return null;
  return (
    <Link
      href="/settings#sync"
      onClick={onNavigate}
      className="inline-flex min-h-11 items-center gap-2 rounded-control border border-warning bg-surface-subtle px-3 py-2 text-sm font-semibold text-foreground"
      aria-live="polite"
    >
      <span aria-hidden="true" className="text-warning">
        ●
      </span>
      {label}
    </Link>
  );
}

function SidebarContents({
  role,
  signedIn,
  pathname,
  currentEvent,
  onNavigate,
}: {
  role?: ProfileRole;
  signedIn: boolean;
  pathname: string;
  currentEvent: CurrentEvent | null;
  onNavigate?: () => void;
}) {
  const eventKey = pathname.startsWith("/events/")
    ? decodeURIComponent(pathname.split("/")[2] || "")
    : "";
  const eventLabel =
    currentEvent?.key === eventKey ? currentEvent.label : eventKey;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pb-5 pt-6">
        <Link
          href="/events"
          onClick={onNavigate}
          className="inline-flex min-h-12 items-center"
          aria-label="EPIC Robotz Team 4415 — EPIC Scout events"
        >
          <Image
            src="/icons/Logo_longv1.png"
            width={210}
            height={42}
            alt="EPIC Robotz Team 4415"
            priority
            className="h-auto w-[210px] max-w-full object-contain"
          />
        </Link>
      </div>
      {eventKey && (
        <div className="mx-4 mb-5 rounded-control bg-surface-subtle px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">
            Current event
          </p>
          <Link
            href={`/events/${encodeURIComponent(eventKey)}`}
            onClick={onNavigate}
            className="mt-1 block truncate text-sm font-semibold text-foreground hover:text-accent"
            title={eventLabel}
          >
            {eventLabel}
          </Link>
          <p className="mt-1 text-xs text-muted">{eventKey}</p>
        </div>
      )}
      <nav
        aria-label="Workspace navigation"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-6"
      >
        {workspaceGroups(role, eventKey || undefined).map((group) => (
          <div key={group.label}>
            <h2 className="px-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">
              {group.label}
            </h2>
            <div className="mt-2 space-y-0.5">
              {group.links.map((item) => {
                const active = isActiveWorkspaceLink(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center rounded-control border-l-[3px] px-3 py-2 text-sm transition-colors ${active ? "border-brand-primary bg-accent-soft font-semibold text-foreground" : "border-transparent text-muted hover:bg-surface-subtle hover:text-foreground"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {signedIn && (
        <div className="space-y-2 border-t border-border px-4 py-4">
          <SyncAlert onNavigate={onNavigate} />
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={`flex min-h-12 items-center gap-3 rounded-control px-3 text-sm font-semibold ${pathname === "/settings" ? "bg-accent-soft text-foreground" : "text-muted hover:bg-surface-subtle hover:text-foreground"}`}
          >
            <GearIcon /> Settings
          </Link>
        </div>
      )}
    </div>
  );
}

export function WorkspaceShell({
  children,
  role,
  signedIn,
}: {
  children: ReactNode;
  role?: ProfileRole;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const [currentEvent, setCurrentEvent] = useState<CurrentEvent | null>(null);
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const backdrop = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const opened = useRef(false);
  const previousPathname = useRef(pathname);
  function closeDrawer() {
    setOpen(false);
  }
  useEffect(() => {
    if (open) {
      opened.current = true;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const frame = requestAnimationFrame(() =>
        drawer.current?.querySelector<HTMLElement>("a[href], button")?.focus(),
      );
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeDrawer();
        }
        if (event.key !== "Tab") return;
        const elements = [
          ...(drawer.current?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? []),
        ];
        if (!elements.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      const onFocusIn = (event: FocusEvent) => {
        if (
          event.target !== backdrop.current &&
          !drawer.current?.contains(event.target as Node)
        ) {
          drawer.current
            ?.querySelector<HTMLElement>("a[href], button")
            ?.focus();
        }
      };
      document.addEventListener("focusin", onFocusIn);
      return () => {
        cancelAnimationFrame(frame);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("focusin", onFocusIn);
        document.body.style.overflow = previousOverflow;
      };
    }
    if (opened.current) menuButton.current?.focus();
  }, [open]);
  useEffect(() => {
    if (
      previousPathname.current !== pathname ||
      !signedIn ||
      isAuthPage(pathname)
    ) {
      previousPathname.current = pathname;
      setOpen(false);
    }
  }, [pathname, signedIn]);
  if (!signedIn || isAuthPage(pathname))
    return <AuthShell>{children}</AuthShell>;
  return (
    <EventContext.Provider value={setCurrentEvent}>
      <div className="min-h-dvh lg:flex">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[70] -translate-y-24 rounded-control bg-foreground px-5 py-3 font-semibold text-on-foreground focus:translate-y-0"
        >
          Skip to content
        </a>
        <aside className="hidden shrink-0 border-r border-border bg-sidebar-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:flex-col lg:overflow-hidden">
          <SidebarContents
            role={role}
            signedIn={signedIn}
            pathname={pathname}
            currentEvent={currentEvent}
          />
        </aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-border bg-sidebar-surface lg:hidden">
            <div className="flex min-h-16 items-center gap-3 px-4">
              <button
                ref={menuButton}
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Open navigation"
                aria-expanded={open}
                aria-controls="mobile-navigation"
                className="touch-pressable flex size-11 shrink-0 items-center justify-center rounded-control text-foreground hover:bg-surface-subtle"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="size-6"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
              <Link
                href="/events"
                className="min-w-0 flex-1"
                aria-label="EPIC Robotz Team 4415 — EPIC Scout events"
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
              {signedIn && (
                <Link
                  href="/settings"
                  aria-label="Settings"
                  className="touch-pressable flex size-11 shrink-0 items-center justify-center rounded-control text-foreground hover:bg-surface-subtle"
                >
                  <GearIcon />
                </Link>
              )}
            </div>
            {signedIn && (
              <div className="px-4 pb-2 empty:hidden">
                <SyncAlert />
              </div>
            )}
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-10"
          >
            {children}
          </main>
        </div>
        <div
          className={`fixed inset-0 z-50 lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!open}
        >
          <button
            ref={backdrop}
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            tabIndex={-1}
            className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
          />
          <div
            id="mobile-navigation"
            ref={drawer}
            role="dialog"
            aria-modal={open ? "true" : undefined}
            aria-label="Navigation"
            inert={!open}
            className={`absolute inset-y-0 left-0 w-[min(20rem,88vw)] overflow-hidden bg-sidebar-surface shadow-xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
          >
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close navigation"
              className="touch-pressable absolute right-3 top-3 flex size-11 items-center justify-center rounded-control text-muted hover:bg-surface-subtle"
            >
              ✕
            </button>
            <SidebarContents
              role={role}
              signedIn={signedIn}
              pathname={pathname}
              currentEvent={currentEvent}
              onNavigate={closeDrawer}
            />
          </div>
        </div>
      </div>
    </EventContext.Provider>
  );
}
