"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { hasPitGeometry, type EventPitMap } from "../model";
import { PitMapLegend } from "./pit-map-legend";
import { PitMapLayout } from "./pit-map-layout";
import { PitMapViewport } from "./pit-map-viewport";
import {
  mapViewBounds,
  type PitMapViewMode,
  type MapViewportMemory,
} from "../viewport";

export function PitMap({
  map,
  eventKey,
  knownTeams,
  completedTeams,
  activeTeams,
  highlightedTeams,
  liveAvailable,
}: {
  map: EventPitMap | null;
  eventKey: string;
  knownTeams: ReadonlySet<number>;
  completedTeams: ReadonlySet<number>;
  activeTeams: ReadonlySet<number>;
  highlightedTeams: ReadonlySet<number>;
  liveAvailable: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [requestedMode, setMode] = useState<PitMapViewMode>("pits");
  const hasPits = !!map?.pits.length;
  const mode = hasPits ? requestedMode : "venue";
  const bounds = useMemo(
    () => (map ? mapViewBounds(map, mode) : null),
    [map, mode],
  );
  const viewportMemory = useRef<MapViewportMemory>({});
  const dialog = useRef<HTMLDialogElement>(null),
    expandButton = useRef<HTMLButtonElement>(null);
  const contentId = useId(),
    dialogTitle = useId();
  useEffect(() => {
    if (!expanded) return;
    const node = dialog.current;
    const trigger = expandButton.current;
    node?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [expanded]);
  const viewport = useMemo(
    () =>
      hasPitGeometry(map) && map && bounds ? (
        <PitMapViewport
          bounds={bounds}
          mode={mode}
          onModeChange={setMode}
          hasPits={hasPits}
          memory={viewportMemory}
          expanded={expanded}
        >
          <PitMapLayout
            map={map}
            eventKey={eventKey}
            knownTeams={knownTeams}
            completedTeams={completedTeams}
            activeTeams={activeTeams}
            highlightedTeams={highlightedTeams}
            mode={mode}
          />
        </PitMapViewport>
      ) : null,
    [
      map,
      expanded,
      eventKey,
      knownTeams,
      completedTeams,
      activeTeams,
      highlightedTeams,
      bounds,
      mode,
      hasPits,
    ],
  );
  const attribution =
    map?.source === "nexus" ? (
      <p className="text-xs text-muted">
        Layout / pit addresses from{" "}
        <a
          href="https://frc.nexus"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Nexus ↗
        </a>{" "}
        · Cached {map.fetchedAt}
      </p>
    ) : null;
  return (
    <section
      aria-label="Pit Map"
      className="rounded-card border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Pit Map</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            aria-expanded={!collapsed}
            aria-controls={contentId}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? "Show Map" : "Collapse Map"}
          </Button>
          {viewport && (
            <button
              ref={expandButton}
              type="button"
              className="min-h-12 rounded-control border border-border px-4 text-sm font-semibold"
              onClick={() => setExpanded(true)}
            >
              Expand / Fullscreen Map
            </button>
          )}
        </div>
      </div>
      <div id={contentId} hidden={collapsed} className="mt-3 space-y-3">
        {viewport ? (
          <>
            <PitMapLegend />
            <p className="text-xs text-muted">
              {liveAvailable
                ? "Live activity connected."
                : "Live activity unavailable; completion status available."}
            </p>
            {!expanded && viewport}
          </>
        ) : (
          <p className="text-sm text-muted">
            No pit map available for this event.{" "}
            {map?.assignments.length
              ? "Pit addresses are listed below."
              : "Use the team list below."}
          </p>
        )}
        {attribution}
      </div>
      {expanded && (
        <dialog
          ref={dialog}
          aria-labelledby={dialogTitle}
          onCancel={(e) => {
            e.preventDefault();
            setExpanded(false);
          }}
          className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-surface p-3 text-foreground backdrop:bg-black/60 sm:p-5"
        >
          <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id={dialogTitle} className="text-lg font-bold">
                Pit Map
              </h2>
              <Button variant="secondary" onClick={() => setExpanded(false)}>
                Close Map
              </Button>
            </div>
            <PitMapLegend />
            {viewport}
            {attribution}
          </div>
        </dialog>
      )}
    </section>
  );
}
