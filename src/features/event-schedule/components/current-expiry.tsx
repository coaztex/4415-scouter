"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** One local deadline refresh removes CURRENT when its evidence expires. */
export function CurrentExpiry({ expiresAt }: { expiresAt: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(
      () => router.refresh(),
      Math.max(0, expiresAt - Date.now() + 1000),
    );
    return () => clearTimeout(timer);
  }, [expiresAt, router]);
  return null;
}
