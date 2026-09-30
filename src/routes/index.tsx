import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Flame, Plus, Sparkles, Target } from "lucide-react";

import { ReviewUnitCard } from "@/components/verba/ReviewUnitCard";
import { unitState } from "@/lib/verba/reviews";
import { useReviewUnits } from "@/lib/verba/use-review-units";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { SignatureFrame } from "@/components/verba/SignatureFrame";
import { useLearner } from "@/components/verba/AppGate";
import { StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { getDailyProgress, getLanguageStreak, listSets, updateLearner } from "@/lib/verba/api";
import { TARGET_LANGUAGES } from "@/lib/i18n/languages";

const TARGET_FLAGS: Record<string, string> = { en: "🇬🇧", fr: "🇫🇷", es: "🇪🇸", de: "🇩🇪" };

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
  const { deviceId, learner, refresh } = useLearner();
  const { t, target } = useI18n();
  const queryClient = useQueryClient();
  const changeLanguage = useMutation({
    mutationFn: (code: string) => updateLearner(deviceId, { learning_language: code }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["learner", deviceId] }); refresh(); },
  });
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
    queryKey: ["sets", deviceId, learner.learning_language],
    queryFn: () => listSets(deviceId, learner.learning_language),
  });
  const { data: today } = useQuery({
    queryKey: ["daily", deviceId, learner.learning_language],
    queryFn: () => getDailyProgress(deviceId, learner.learning_language),
  });
  const { data: streak } = useQuery({
    queryKey: ["language-streak", deviceId, learner.learning_language],
    queryFn: () => getLanguageStreak(deviceId, learner.learning_language),
  });

  const recent = sets?.[0];
  const goal = Math.max(1, Number(learner.daily_goal_minutes) || 1);
  const rawMinutes = Number(today?.minutes_practiced ?? 0);
  const minutes = Number.isFinite(rawMinutes) && rawMinutes > 0 ? Math.round(rawMinutes) : 0;
  const goalPct = Math.max(0, Math.min(100, Math.round((minutes / goal) * 100)));

  return (
    <AppShell>
      <SignatureFrame>
        <h1 dir="ltr" className="w-fit text-3xl font-bold text-hero-foreground">LingoFlow</h1>
        <div className="mt-4 flex items-center gap-2">
          <label htmlFor="home-language" className="sr-only">{t("profile.target")}</label>
          <select
            id="home-language"
            value={learner.learning_language}
            onChange={(event) => changeLanguage.mutate(event.target.value)}
            disabled={changeLanguage.isPending}
            aria-label={t("profile.target")}
            className="min-h-11 max-w-full rounded-full border border-hero-foreground/40 bg-hero-foreground/15 px-4 text-sm font-semibold text-hero-foreground shadow-card backdrop-blur-sm focus-visible:outline-2 focus-visible:outline-hero-foreground disabled:opacity-60"
          >
            {TARGET_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="text-foreground">
                {TARGET_FLAGS[lang.code] ?? "🌐"} {lang.native}
              </option>
            ))}
          </select>
          {changeLanguage.isError ? <span role="alert" className="text-xs text-hero-foreground">{t("profile.targetChangeNote")}</span> : null}
        </div>
        <p className="mt-3 min-h-5 text-sm font-medium text-hero-foreground/90">{greeting ? t(greeting) : ""}</p>
        <p className="mt-1 text-sm text-hero-foreground/85">{t("home.learning", { language: target.native })}</p>

        <div className="mt-5 flex gap-3">
          <div className="min-w-0 flex-1 rounded-2xl border border-hero-foreground/15 bg-hero-foreground/12 p-4 backdrop-blur-sm">
            <Flame className="size-5 text-hero-foreground" />
            <p className="mt-2 text-2xl font-bold">{streak ?? 0}</p>
            <p className="text-xs text-hero-foreground/85">
              {(streak ?? 0) > 0 ? t("home.streak", { count: streak ?? 0 }) : t("home.streakNone")}
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
      </SignatureFrame>

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
