import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppShell, PageTitle } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { ReviewUnitCard } from "@/components/verba/ReviewUnitCard";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { unitState, type ReviewUnit } from "@/lib/verba/reviews";
import { useReviewUnits } from "@/lib/verba/use-review-units";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review — LingoFlow" },
      {
        name: "description",
        content: "Your Word Sets and Tenses & Forms that are due, paused, or coming up for review.",
      },
      { property: "og:title", content: "Review — LingoFlow" },
      {
        property: "og:description",
        content: "Group-based spaced review: due, ignored and upcoming Word Sets.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string; count?: number }[];
  onChange: (key: T) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-2xl bg-secondary p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors sm:text-sm",
            value === o.key ? "bg-primary-soft text-primary-deep" : "text-foreground hover:bg-card",
          )}
        >
          <span className="truncate">{o.label}</span>
          {o.count ? (
            <span className="rounded-full bg-primary/10 px-1.5 text-[0.65rem] font-bold">{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function UnitList({ units, now, empty }: { units: ReviewUnit[]; now: Date; empty: string }) {
  if (units.length === 0) {
    return (
      <div className="p-5 text-center">
        <CheckCircle2 className="mx-auto size-6 text-primary" />
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2.5">
      {units.map((u) => (
        <li key={u.key}>
          <ReviewUnitCard unit={u} now={now} />
        </li>
      ))}
    </ul>
  );
}

function ReviewPage() {
  const { deviceId } = useLearner();
  const { t } = useI18n();
  const { units, now } = useReviewUnits(deviceId);
  const [main, setMain] = useState<"due" | "ignored" | "forms">("due");
  const [upcomingTab, setUpcomingTab] = useState<"words" | "forms">("words");

  const all = units ?? [];
  const byState = (u: ReviewUnit) => unitState(u, now);
  // Each unit lands in exactly one place, from its persisted schedule/session.
  const byDate = (a: ReviewUnit, b: ReviewUnit) =>
    (a.nextReviewAt ?? "9").localeCompare(b.nextReviewAt ?? "9");
  const due = all.filter((u) => u.kind === "words" && byState(u) === "due").sort(byDate);
  // Ignored: a scheduled review left unfinished, or one skipped past its day.
  const ignored = all
    .filter((u) => byState(u) === "ignored" || byState(u) === "overdue")
    .sort(byDate);
  const forms = all.filter((u) => u.kind === "forms" && byState(u) === "due").sort(byDate);
  const upcoming = all
    .filter((u) => {
      const s = byState(u);
      return (s === "upcoming" || s === "unscheduled") && u.kind === upcomingTab;
    })
    .sort(byDate);

  return (
    <AppShell>
      <PageTitle title={t("review.title")} subtitle={t("review.subtitle")} />

      {units === undefined ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <>
          <section className="card-surface space-y-4 p-3">
            <Segmented
              value={main}
              onChange={setMain}
              options={[
                { key: "due", label: t("review.tabDue"), count: due.length },
                { key: "ignored", label: t("review.tabIgnored"), count: ignored.length },
                { key: "forms", label: t("review.tabForms"), count: forms.length },
              ]}
            />
            {main === "due" ? (
              <UnitList units={due} now={now} empty={t("review.emptyDue")} />
            ) : main === "ignored" ? (
              <UnitList units={ignored} now={now} empty={t("review.emptyIgnored")} />
            ) : (
              <UnitList units={forms} now={now} empty={t("review.emptyDue")} />
            )}
          </section>

          <h2 className="mt-7 mb-3 text-lg font-bold">{t("review.upcoming")}</h2>
          <Segmented
            value={upcomingTab}
            onChange={setUpcomingTab}
            options={[
              { key: "words", label: t("review.tabOriginal") },
              { key: "forms", label: t("review.tabForms") },
            ]}
          />
          <div className="mt-3">
            <UnitList units={upcoming} now={now} empty={t("review.emptyUpcoming")} />
          </div>
        </>
      )}
    </AppShell>
  );
}
