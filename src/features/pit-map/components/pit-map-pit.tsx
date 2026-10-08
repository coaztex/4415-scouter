"use client";
import { memo } from "react";
import Link from "next/link";
import type { PitMapPit as Pit } from "../model";
import { pitMapStatuses, type PitMapStatus } from "../status";

export const PitMapPit = memo(function PitMapPit({
  pit,
  eventKey,
  status,
  highlighted,
}: {
  pit: Pit;
  eventKey: string;
  status: PitMapStatus;
  highlighted: boolean;
}) {
  const style = pitMapStatuses[status];
  const linked = pit.teamNumber !== null && status !== "unassigned";
  const accessible = `${pit.teamNumber === null ? "Unassigned pit" : `Team ${pit.teamNumber}`}, pit ${pit.pitLabel ?? pit.id}, ${style.label}${highlighted ? ", search match" : ""}`;
  const font = Math.max(1, Math.min(pit.height * 0.27, pit.width / 3.8));
  const ringGap = Math.min(pit.width, pit.height) * 0.05;
  const content = (
    <>
      <rect
        className="pit-map-focus-ring"
        aria-hidden="true"
        pointerEvents="none"
        x={pit.x - ringGap}
        y={pit.y - ringGap}
        width={pit.width + ringGap * 2}
        height={pit.height + ringGap * 2}
        rx={ringGap * 2}
        fill="none"
        stroke="#2563eb"
        strokeWidth={3}
        opacity={highlighted ? 1 : 0}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        className="pit-map-box"
        x={pit.x}
        y={pit.y}
        width={pit.width}
        height={pit.height}
        rx={Math.min(pit.width, pit.height) * 0.06}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={2}
        strokeDasharray={status === "in_progress" ? "5 3" : undefined}
        vectorEffect="non-scaling-stroke"
      />
      <g fill={style.text} textAnchor="middle" pointerEvents="none">
        {pit.teamNumber !== null && (
          <text
            x={pit.x + pit.width / 2}
            y={pit.y + pit.height * 0.4}
            fontSize={font}
            fontWeight="800"
          >
            {pit.teamNumber}
          </text>
        )}
        <text
          x={pit.x + pit.width / 2}
          y={pit.y + pit.height * (pit.teamNumber === null ? 0.55 : 0.65)}
          fontSize={font * (pit.teamNumber === null ? 0.9 : 0.7)}
          dominantBaseline={pit.teamNumber === null ? "middle" : undefined}
          textLength={
            (pit.pitLabel ?? pit.id).length > 10 ? pit.width * 0.85 : undefined
          }
          lengthAdjust="spacingAndGlyphs"
        >
          {pit.pitLabel ?? pit.id}
        </text>
        {pit.teamNumber !== null && (
          <text
            x={pit.x + pit.width / 2}
            y={pit.y + pit.height * 0.88}
            fontSize={font * 0.7}
          >
            {style.symbol}
          </text>
        )}
      </g>
    </>
  );
  return linked ? (
    <Link
      prefetch={false}
      href={`/events/${eventKey}/pit/${pit.teamNumber}`}
      aria-label={accessible}
      data-pit-rect={`${pit.x},${pit.y},${pit.width},${pit.height}`}
      className="pit-map-link"
    >
      {content}
    </Link>
  ) : (
    <g role="img" aria-label={accessible}>
      {content}
    </g>
  );
});
