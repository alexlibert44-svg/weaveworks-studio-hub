import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LanguageFlag } from "@/components/verba/LanguageSelector";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES, TARGET_LANGUAGES, type LanguageMeta } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";
import { updateLearner } from "@/lib/verba/api";

import { useLearner } from "./AppGate";

const GOALS = [5, 10, 15, 30];

/**
 * Three steps: the language you speak, the language you learn, your daily
 * goal. Step 1 is saved immediately so the rest of the flow is already shown
 * in the learner's own language and direction.
 */
export function Onboarding() {
  const { deviceId, learner, refresh } = useLearner();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState<string | null>(null);
  const [goal, setGoal] = useState(learner.daily_goal_minutes || 10);

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateLearner>[1]) => updateLearner(deviceId, patch),
    onSuccess: refresh,
  });

  const chooseNative = (code: string) => {
    save.mutate({ native_language: code });
    setStep(2);
  };

  const chooseTarget = (code: string) => {
    setTarget(code);
    save.mutate({ learning_language: code });
    setStep(3);
  };

  const finish = () => {
    save.mutate({
      daily_goal_minutes: goal,
      learning_language: target ?? learner.learning_language,
      onboarding_completed: true,
    });
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-10 pb-8">
      <p className="text-xs font-bold tracking-widest text-primary uppercase">
        {t("onboarding.step", { current: step, total: 3 })}
      </p>
      <div className="mt-3 flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              n <= step ? "bg-primary" : "bg-secondary",
            )}
          />
        ))}
      </div>

      {step === 1 ? (
        <LanguageStep
          title={t("onboarding.native.title")}
          subtitle={t("onboarding.native.subtitle")}
          selected={learner.native_language}
          onSelect={chooseNative}
        />
      ) : null}

      {step === 2 ? (
        <LanguageStep
          title={t("onboarding.target.title")}
          subtitle={t("onboarding.target.subtitle")}
          selected={target}
          exclude={learner.native_language}
          excludeNote={t("onboarding.same")}
          languages={TARGET_LANGUAGES}
          onSelect={chooseTarget}
        />
      ) : null}

      {step === 3 ? (
        <div className="animate-rise mt-8 flex flex-1 flex-col">
          <h1 className="text-2xl font-bold">{t("onboarding.goal.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("onboarding.goal.subtitle")}</p>
          <ul className="mt-6 space-y-2.5">
            {GOALS.map((minutes) => (
              <li key={minutes}>
                <button
                  type="button"
                  onClick={() => setGoal(minutes)}
                  aria-pressed={goal === minutes}
                  className={cn(
                    "flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-start text-sm font-semibold transition-colors",
                    goal === minutes
                      ? "border-primary bg-primary-soft text-primary-deep"
                      : "border-border bg-card text-foreground",
                  )}
                >
                  {t("onboarding.goalOption", { minutes })}
                  {goal === minutes ? <Check className="size-4" /> : null}
                </button>
              </li>
            ))}
          </ul>
          <Button
            size="lg"
            className="mt-auto w-full rounded-2xl"
            onClick={finish}
            disabled={save.isPending}
          >
            {t("onboarding.start")}
            <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LanguageStep({
  title,
  subtitle,
  selected,
  exclude,
  excludeNote,
  languages = LANGUAGES,
  onSelect,
}: {
  title: string;
  subtitle: string;
  selected: string | null;
  exclude?: string;
  excludeNote?: string;
  languages?: LanguageMeta[];
  onSelect: (code: string) => void;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const results = useMemo<LanguageMeta[]>(() => {
    const query = search.trim().toLowerCase();
    return languages.filter((l) => l.code !== exclude).filter(
      (l) =>
        query.length === 0 ||
        l.english.toLowerCase().includes(query) ||
        l.native.toLowerCase().includes(query),
    );
  }, [search, exclude, languages]);

  return (
    <div className="animate-rise mt-8 flex flex-1 flex-col">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
      {excludeNote ? <p className="mt-1 text-xs text-muted-foreground">{excludeNote}</p> : null}

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("onboarding.search")}
          aria-label={t("onboarding.search")}
          className="h-12 rounded-2xl ps-10"
        />
      </div>

      <ul className="mt-4 space-y-2">
        {results.map((lang) => (
          <li key={lang.code}>
            <button
              type="button"
              onClick={() => onSelect(lang.code)}
              className={cn(
                "flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-start transition-colors",
                selected === lang.code
                  ? "border-primary bg-primary-soft"
                  : "border-border bg-card",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <LanguageFlag code={lang.code} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{lang.native}</span>
                  <span className="block truncate text-xs text-muted-foreground">{lang.english}</span>
                </span>
              </span>
              {selected === lang.code ? <Check className="size-4 text-primary" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
