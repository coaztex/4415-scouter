"use client";
import { useState } from "react";
import Image from "next/image";

/** Decorative branding beside an explicit team name; never uses a robot photo. */
export function TeamAvatar({
  teamNumber,
  src,
  size = 48,
}: {
  teamNumber: number;
  src?: string | null;
  size?: 48 | 64;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const visible = src && src !== failedSrc;
  return (
    <span
      data-team-avatar={visible ? "logo" : "fallback"}
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-control border border-border bg-avatar-surface text-avatar-text"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {visible ? (
        <Image
          unoptimized
          src={src}
          alt=""
          width={size}
          height={size}
          sizes={`${size}px`}
          loading="lazy"
          className="h-full w-full object-contain drop-shadow-[0_0_1px_rgba(0,0,0,0.65)]"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span className="text-center text-xs font-bold leading-none tabular-nums text-avatar-text">
          {teamNumber}
        </span>
      )}
    </span>
  );
}
