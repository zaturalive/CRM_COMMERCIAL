import type { LucideIcon } from "lucide-react";
import { GlassCard } from "./GlassCard";

interface ComingSoonProps {
  title: string;
  description?: string;
  storyRef: string; // ex "EP04-S01"
  icon?: LucideIcon;
}

export function ComingSoon({ title, description, storyRef, icon: Icon }: ComingSoonProps) {
  return (
    <GlassCard className="mx-auto max-w-xl p-8">
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
            <Icon size={22} strokeWidth={1.75} />
          </div>
        )}
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
            {storyRef}
          </div>
          <h1 className="font-display text-xl font-semibold text-text-primary">
            {title}
          </h1>
          {description && (
            <p className="mt-2 text-sm text-text-secondary">{description}</p>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
