"use client";
import { memo } from "react";
import type { EventPitMap } from "../model";
import { pitMapStatus } from "../status";
import { PitMapPit } from "./pit-map-pit";
import type { PitMapViewMode } from "../viewport";

const Geometry = memo(function Geometry({
  map,
  mode,
}: {
  map: EventPitMap;
  mode: PitMapViewMode;
}) {
  return (
    <g
      pointerEvents="none"
      aria-hidden="true"
      data-map-geometry="venue"
      display={mode === "pits" ? "none" : undefined}
    >
      <rect
        width={map.width ?? 0}
        height={map.height ?? 0}
        fill="var(--surface)"
        stroke="var(--border)"
        strokeOpacity={0.3}
      />
      {map.areas.map((area, i) => (
        <g key={i}>
          <rect
            x={area.x}
            y={area.y}
            width={area.width}
            height={area.height}
            fill="var(--surface-subtle)"
            stroke="var(--border)"
            strokeOpacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={area.x + area.width / 2}
            y={area.y + area.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--foreground)"
            opacity={0.75}
            fontSize={Math.min(
              area.height * 0.3,
              area.width / Math.max(5, area.label.length),
            )}
          >
            {area.label}
          </text>
        </g>
      ))}
      {map.walls.map((wall, i) => (
        <rect key={i} {...wall} fill="var(--muted)" opacity={0.22} />
      ))}
      {map.labels.map((label, i) => (
        <text
          key={i}
          x={label.x}
          y={label.y}
          fill="var(--foreground)"
          opacity={0.75}
          fontSize={Math.min(map.width ?? 500, map.height ?? 500) * 0.018}
        >
          {label.text}
        </text>
      ))}
      {map.arrows.map((arrow, i) => (
        <g
          key={i}
          transform={`translate(${arrow.x + arrow.width / 2} ${arrow.y + arrow.height / 2}) rotate(${arrow.angle})`}
        >
          <path
            d={`M ${-arrow.width / 2} ${-arrow.height / 6} H ${arrow.width / 6} V ${-arrow.height / 2} L ${arrow.width / 2} 0 L ${arrow.width / 6} ${arrow.height / 2} V ${arrow.height / 6} H ${-arrow.width / 2} Z`}
            fill="var(--muted)"
            opacity={0.4}
          />
        </g>
      ))}
    </g>
  );
});
export const PitMapLayout = memo(function PitMapLayout({
  map,
  eventKey,
  knownTeams,
  completedTeams,
  activeTeams,
  highlightedTeams,
  mode = "pits",
}: {
  map: EventPitMap;
  eventKey: string;
  knownTeams: ReadonlySet<number>;
  completedTeams: ReadonlySet<number>;
  activeTeams: ReadonlySet<number>;
  highlightedTeams: ReadonlySet<number>;
  mode?: PitMapViewMode;
}) {
  return (
    <>
      <Geometry map={map} mode={mode} />
      {map.pits.map((pit) => (
        <PitMapPit
          key={pit.id}
          pit={pit}
          eventKey={eventKey}
          status={pitMapStatus(
            pit.teamNumber,
            knownTeams,
            completedTeams,
            activeTeams,
          )}
          highlighted={
            pit.teamNumber !== null && highlightedTeams.has(pit.teamNumber)
          }
        />
      ))}
    </>
  );
});
