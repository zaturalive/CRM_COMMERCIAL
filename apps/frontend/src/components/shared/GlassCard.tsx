import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid glass card — style de reference du design system
 * (spec-design-figma-v1_3.md §1.1).
 */
export function GlassCard({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/80 shadow-md backdrop-blur-[20px]",
        className
      )}
      style={{ background: "var(--surface-glass)" }}
      {...rest}
    >
      {children}
    </div>
  );
}
