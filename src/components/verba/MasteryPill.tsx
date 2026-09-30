import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { masteryState } from "@/lib/verba/srs";
import type { MasteryState } from "@/lib/verba/types";

const STYLES: Record<MasteryState, string> = {
  new: "bg-muted text-muted-foreground",
  learning: "bg-warning-soft text-accent-foreground",
  familiar: "bg-primary-soft text-primary-deep",
  strong: "bg-success-soft text-success",
  mastered: "bg-primary text-primary-foreground",
};

const LABELS: Record<MasteryState, MessageKey> = {
  new: "mastery.new",
  learning: "mastery.learning",
  familiar: "mastery.familiar",
  strong: "mastery.strong",
  mastered: "mastery.mastered",
};

export function MasteryPill({ mastery, className }: { mastery: number; className?: string }) {
  const { t } = useI18n();
  const state = masteryState(mastery) as MasteryState;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
        STYLES[state],
        className,
      )}
    >
      {t(LABELS[state])}
    </span>
  );
}

export function MasteryBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className="bg-hero-gradient h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Pill for a stored state (word set, word or form status). */
export function StatePill({ state, className }: { state: MasteryState; className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold",
        STYLES[state],
        className,
      )}
    >
      {t(LABELS[state])}
    </span>
  );
}
