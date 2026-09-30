import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Flame, Plus, Sparkles, Target } from "lucide-react";

import { ReviewUnitCard } from "@/components/verba/ReviewUnitCard";
import { unitState } from "@/lib/verba/reviews";
import { useReviewUnits } from "@/lib/verba/use-review-units";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { getDailyProgress, listSets } from "@/lib/verba/api";

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
  const [greeting, setGreeting] = useState<ReturnType<typeof greetingKey> | null>(null);

  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingKey());
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { units, now } = useReviewUnits(deviceId);
  const due = units?.filter((u) => {
    const state = unitState(u, now);
    return state === "due" || state === "overdue";
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
      <div className="bg-hero-gradient animate-rise relative -mx-5 -mt-6 overflow-hidden rounded-b-4xl px-5 pt-8 pb-9 text-hero-foreground shadow-card">
        <div aria-hidden="true" className="pointer-events-none absolute -end-14 -top-16 size-52 rounded-full bg-hero-circle-blue opacity-30" />
        <div aria-hidden="true" className="pointer-events-none absolute end-6 top-24 size-24 rounded-full bg-hero-circle-purple opacity-35" />
        <div aria-hidden="true" className="pointer-events-none absolute -start-14 bottom-2 size-40 rounded-full bg-hero-circle-blue opacity-20" />
        <div className="relative z-10">
        <h1 dir="ltr" className="w-fit text-3xl font-bold text-hero-foreground">LingoFlow</h1>
        <p className="mt-3 min-h-5 text-sm font-medium text-hero-foreground/90">{greeting ? t(greeting) : ""}</p>
        <p className="mt-1 text-sm text-hero-foreground/85">{t("home.learning", { language: target.native })}</p>

        <div className="mt-5 flex gap-3">
          <div className="min-w-0 flex-1 rounded-2xl border border-hero-foreground/15 bg-hero-foreground/12 p-4 backdrop-blur-sm">
            <Flame className="size-5 text-hero-foreground" />
            <p className="mt-2 text-2xl font-bold">{learner.streak}</p>
            <p className="text-xs text-hero-foreground/85">
              {learner.streak > 0 ? t("home.streak", { count: learner.streak }) : t("home.streakNone")}
            </p>
          </div>
          <div className="min-w-0 flex-1 rounded-2xl border border-hero-foreground/15 bg-hero-foreground/12 p-4 backdrop-blur-sm">
            <Target className="size-5 text-hero-foreground" />
            <p className="mt-2 text-2xl font-bold">
              {minutes}
              <span className="text-sm font-semibold opacity-80">/{goal}</span>
            </p>
            <p className="text-xs text-hero-foreground/85">
              {t("home.goal")} · {goalPct}%
            </p>
          </div>
        </div>
        </div>
      </div>

      <div className="mt-7 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("home.dueTitle")}</h2>
        <Link to="/review" className="text-sm font-semibold text-primary">
          {t("home.viewAll")}
        </Link>
      </div>
      {due ? (
        due.length > 0 ? (
          <ul className="space-y-2.5">
            {due.slice(0, 3).map((unit) => (
              <li key={unit.key}>
                <ReviewUnitCard unit={unit} now={now} />
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
                {t("sets.wordCount", { count: recent.wordCount })}
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
