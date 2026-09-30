import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell, PageTitle } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { posLabel } from "@/lib/verba/pos";
import { getReviewOverview, type ReviewStatus } from "@/lib/verba/api";
import { SKILL_KEY, type Skill } from "@/lib/verba/types";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review — LingoFlow" },
      {
        name: "description",
        content:
          "Spaced repetition keeps your words alive: see exactly what is due now and start reviewing.",
      },
      { property: "og:title", content: "Review — LingoFlow" },
      {
        property: "og:description",
        content: "What's due today, broken down by writing, speaking, recall and forms.",
      },
    ],
  }),
  component: ReviewPage,
});

const STATUS_KEYS: Record<ReviewStatus, string> = {
  due: "review.status.due",
  new: "review.status.new",
  learning: "review.status.learning",
  weak: "review.status.weak",
  strong: "review.status.strong",
  mastered: "review.status.mastered",
};

function Chip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3.5 py-2 text-xs font-semibold transition",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-primary-soft text-primary-deep hover:bg-primary-soft/70",
      )}
    >
      <span className="inline-flex items-center gap-2">
        <span>{label}</span>
        {count === undefined ? null : (
          <span
            className={cn(
              "inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[0.7rem] font-bold",
              active ? "bg-primary-foreground/20" : "bg-primary/10",
            )}
          >
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

function ReviewPage() {
  const { deviceId } = useLearner();
  const { t, locale } = useI18n();

  const [status, setStatus] = useState<ReviewStatus | null>(null);
  const [pos, setPos] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);

  const { data: due } = useQuery({
    queryKey: ["review", deviceId],
    queryFn: () => getReviewOverview(deviceId),
  });

  const filteredCount = (() => {
    if (!due) return 0;
    if (status) return due.byStatus[status];
    if (setId) return due.bySet.find((s) => s.id === setId)?.due ?? 0;
    if (pos) return due.byPos[pos] ?? 0;
    return due.total;
  })();

  return (
    <AppShell>
      <PageTitle title={t("review.title")} subtitle={t("review.subtitle")} />

      {due === undefined ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : due.total === 0 && due.byStatus.new === 0 ? (
        <div className="card-surface p-7 text-center">
          <CheckCircle2 className="mx-auto size-8 text-success" />
          <p className="mt-3 text-sm font-semibold">{t("review.empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("review.emptyBody")}</p>
          {due.nextReviewAt ? (
            <p className="mt-3 text-xs font-semibold text-primary">
              {t("review.next")}:{" "}
              {new Date(due.nextReviewAt).toLocaleString(locale, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="bg-hero-gradient animate-rise rounded-3xl p-6 text-primary-foreground">
            <p className="text-sm opacity-85">{t("review.due")}</p>
            <p className="mt-1 text-4xl font-bold">{due.total}</p>
            <Button
              asChild
              size="lg"
              disabled={filteredCount === 0}
              className="mt-5 w-full rounded-2xl bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link
                to="/practice"
                search={{
                  ...(setId ? { set: setId } : {}),
                  ...(status ? { status } : {}),
                  ...(pos ? { pos } : {}),
                }}
              >
                <Play className="size-4" />{" "}
                {status || pos || setId
                  ? t("review.startFiltered", { count: filteredCount })
                  : t("review.start")}
              </Link>
            </Button>
          </div>

          <h2 className="mt-7 mb-3 text-lg font-bold">{t("review.filters")}</h2>

          <p className="mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("review.byStatus")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip active={!status} label={t("review.all")} onClick={() => setStatus(null)} />
            {(Object.keys(STATUS_KEYS) as ReviewStatus[]).map((key) => (
              <Chip
                key={key}
                active={status === key}
                label={t(STATUS_KEYS[key] as never)}
                count={due.byStatus[key]}
                onClick={() => setStatus(status === key ? null : key)}
              />
            ))}
          </div>

          {Object.keys(due.byPos).length > 0 ? (
            <>
              <p className="mt-5 mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {t("review.byPos")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!pos} label={t("review.all")} onClick={() => setPos(null)} />
                {Object.entries(due.byPos)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, count]) => (
                    <Chip
                      key={key}
                      active={pos === key}
                      label={posLabel(t as never, key)}
                      count={count}
                      onClick={() => setPos(pos === key ? null : key)}
                    />
                  ))}
              </div>
            </>
          ) : null}

          {due.bySet.length > 0 ? (
            <>
              <p className="mt-5 mb-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                {t("review.bySet")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!setId} label={t("review.all")} onClick={() => setSetId(null)} />
                {due.bySet.map((set) => (
                  <Chip
                    key={set.id}
                    active={setId === set.id}
                    label={set.name}
                    count={set.due}
                    onClick={() => setSetId(setId === set.id ? null : set.id)}
                  />
                ))}
              </div>
            </>
          ) : null}

          {filteredCount === 0 ? (
            <p className="mt-4 text-sm font-semibold text-muted-foreground">
              {t("review.noMatch")}
            </p>
          ) : null}

          <h2 className="mt-7 mb-3 text-lg font-bold">{t("review.bySkill")}</h2>
          <ul className="space-y-2.5">
            {(Object.entries(due.bySkill) as [Skill, number][])
              .filter(([, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([skill, count]) => (
                <li key={skill} className="card-surface flex items-center justify-between p-4">
                  <span className="text-sm font-semibold">{t(SKILL_KEY[skill])}</span>
                  <span className="text-sm font-bold text-primary">{count}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
