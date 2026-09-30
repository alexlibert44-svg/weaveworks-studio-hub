import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Flame, Plus, Sparkles, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { getDailyProgress, getDueBreakdown, listSets } from "@/lib/verba/api";
import { SKILL_KEY, type Skill } from "@/lib/verba/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LingoFlow — Learn words in real sentences" },
      {
        name: "description",
        content:
          "Pick the language you speak and the one you're learning, add your own words, and practice them in real sentences with spaced repetition.",
      },
      { property: "og:title", content: "LingoFlow — Learn words in real sentences" },
      {
        property: "og:description",
        content: "Your words, turned into sentences, listening, writing, speaking and recall.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "greeting.morning" as const;
  if (hour < 18) return "greeting.afternoon" as const;
  return "greeting.evening" as const;
}

function Home() {
  const { deviceId, learner } = useLearner();
  const { t, target } = useI18n();

  const { data: due } = useQuery({
    queryKey: ["due", deviceId],
    queryFn: () => getDueBreakdown(deviceId),
  });
  const { data: sets } = useQuery({
    queryKey: ["sets", deviceId],
    queryFn: () => listSets(deviceId),
  });
  const { data: today } = useQuery({
    queryKey: ["daily", deviceId],
    queryFn: () => getDailyProgress(deviceId),
  });

  const recent = sets?.[0];
  const goal = learner.daily_goal_minutes;
  const minutes = Number(today?.minutes_practiced ?? 0);
  const goalPct = Math.min(100, Math.round((minutes / goal) * 100));

  return (
    <AppShell>
      <div className="bg-hero-gradient animate-rise -mx-5 -mt-6 border-b border-border px-5 pt-8 pb-8 text-foreground">
        <p className="text-sm text-muted-foreground">{t(greetingKey())}</p>
        <h1 className="mt-1 text-3xl font-semibold text-primary-deep">{t("app.name")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("home.learning", { language: target.native })}</p>

        <div className="mt-5 flex gap-3">
          <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4">
            <Flame className="size-5 text-primary" />
            <p className="mt-2 text-2xl font-bold">{learner.streak}</p>
            <p className="text-xs text-muted-foreground">
              {learner.streak > 0 ? t("home.streak", { count: learner.streak }) : t("home.streakNone")}
            </p>
          </div>
          <div className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4">
            <Target className="size-5 text-secondary-foreground" />
            <p className="mt-2 text-2xl font-bold">
              {minutes}
              <span className="text-sm font-semibold opacity-80">/{goal}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("home.goal")} · {goalPct}%
            </p>
          </div>
        </div>

        <Button
          asChild
          size="lg"
          className="mt-5 w-full"
        >
          <Link to="/practice" search={{}}>
            {t("home.startReview")}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Link>
        </Button>
      </div>

      <h2 className="mt-7 mb-3 text-lg font-bold">{t("home.dueTitle")}</h2>
      {due ? (
        due.total > 0 ? (
          <ul className="grid grid-cols-2 gap-2">
            {(Object.entries(due.bySkill) as [Skill, number][])
              .filter(([, count]) => count > 0)
              .map(([skill, count]) => (
                <li key={skill} className="card-surface flex items-center justify-between p-3.5">
                  <span className="text-sm font-semibold">{t(SKILL_KEY[skill])}</span>
                  <span className="text-sm font-bold text-primary">{count}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="card-surface p-5 text-sm text-muted-foreground">{t("home.dueNone")}</p>
        )
      ) : (
        <Skeleton className="h-24 rounded-2xl" />
      )}

      <h2 className="mt-7 mb-3 text-lg font-bold">{t("home.current")}</h2>
      {sets === undefined ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : recent ? (
        <Link
          to="/sets/$setId"
          params={{ setId: recent.id }}
          className="card-surface animate-rise block p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-bold">{recent.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("sets.wordCount", { count: recent.wordCount })} ·{" "}
                {t("sets.dueCount", { count: recent.dueCount })}
              </p>
            </div>
            <StatePill state={recent.status} />
          </div>
        </Link>
      ) : (
        <div className="card-surface p-6 text-center">
          <Sparkles className="mx-auto size-7 text-accent" />
          <p className="mt-3 text-sm font-semibold">{t("home.noSets")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("home.noSetsHint")}</p>
          <Button asChild className="mt-4 rounded-xl">
            <Link to="/add">
              <Plus className="size-4" /> {t("home.createSet")}
            </Link>
          </Button>
        </div>
      )}
    </AppShell>
  );
}
