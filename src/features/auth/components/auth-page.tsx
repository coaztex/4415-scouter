import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function AuthPage({
  title,
  description,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto w-full ${wide ? "max-w-xl" : "max-w-md"} lg:py-6`}>
      <div className="mb-7">
        <p className="mb-3 text-xl font-bold tracking-[0.12em] text-accent">
          4415
        </p>
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 text-base text-muted">{description}</p>
        )}
      </div>
      <Card>{children}</Card>
    </div>
  );
}
