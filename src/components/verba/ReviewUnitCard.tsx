import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { unitState, type ReviewUnit } from "@/lib/verba/reviews";
import { countdown } from "@/lib/verba/schedule";

/** One reviewable unit row. Due/overdue open the section inside the set; ignored resumes. */
export function ReviewUnitCard({ unit, now }: { unit: ReviewUnit; now: Date }) {
  const { t, locale } = useI18n();
  const state = unitState(unit, now);
  const typeLabel = unit.kind === "words" ? t("review.typeWords") : t("review.typeForms");

  const stateLabel =
    state === "upcoming" && unit.nextReviewAt
      ? countdown(unit.nextReviewAt, locale, now)
      : t(`review.state.${state}` as never);

  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{unit.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
              unit.kind === "words" ? "bg-primary-soft text-primary-deep" : "bg-accent-soft text-accent-foreground",
            )}
          >
            {typeLabel}
          </span>
          <span
            className={cn(
              "text-xs",
              state === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            {stateLabel}
          </span>
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
    </>
  );

  const className = "card-surface flex items-center gap-3 p-4";
  if (state === "ignored") {
    return (
      <Link to="/practice" search={{ set: unit.setId, review: unit.kind }} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <Link
      to="/sets/$setId"
      params={{ setId: unit.setId }}
      search={unit.kind === "forms" ? { tab: "forms" } : {}}
      className={className}
    >
      {inner}
    </Link>
  );
}
