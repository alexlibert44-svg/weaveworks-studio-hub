import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Loader2, Play, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { posLabel } from "@/lib/verba/pos";
import { MasteryBar, StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { language } from "@/lib/i18n/languages";
import { createForms, deleteSet, getSet } from "@/lib/verba/api";
import {
  FORM_SKILLS,
  UNIT_SKILLS,
  formSkillItems,
  unitProgress,
  wordSkillItems,
  wordStatus,
} from "@/lib/verba/progress";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sets/$setId/")({
  validateSearch: (search: Record<string, unknown>): { tab?: "words" | "forms" } =>
    search["tab"] === "forms" ? { tab: "forms" } : {},
  head: () => ({
    meta: [
      { title: "Word Set — LingoFlow" },
      {
        name: "description",
        content: "Your original words and their tenses & forms, each with its own real progress.",
      },
      { property: "og:title", content: "Word Set — LingoFlow" },
      {
        property: "og:description",
        content: "Train each word or form individually and track real progress.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetDetail,
});

function SetDetail() {
  const { setId } = Route.useParams();
  const { t } = useI18n();
  const { deviceId } = useLearner();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tab = "words" } = Route.useSearch();
  const setTab = (next: "words" | "forms") =>
    void navigate({ to: "/sets/$setId", params: { setId }, search: next === "forms" ? { tab: "forms" } : {}, replace: true });

  const { data } = useQuery({ queryKey: ["set", setId], queryFn: () => getSet(setId) });

  const remove = useMutation({
    mutationFn: () => deleteSet(setId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sets"] });
      void navigate({ to: "/sets" });
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      createForms({
        deviceId,
        setId,
        targetLanguageName: language(data!.set.target_language).english,
        nativeLanguageName: language(data!.set.native_language).english,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["set", setId] }),
  });

  if (!data) {
    return (
      <AppShell>
        <Skeleton className="h-32 rounded-2xl" />
      </AppShell>
    );
  }

  const { set, words, items, forms, formsGenerated, attemptsByWord } = data;
  const wordStatuses = new Map(words.map((w) => [w.id, wordStatus(attemptsByWord.get(w.id) ?? [])]));
  const status = items.every((i) => i.attempts === 0)
    ? "new"
    : words.length > 0 && words.every((w) => wordStatuses.get(w.id) === "mastered")
      ? "mastered"
      : "learning";
  const wordsWithForms = words.filter((w) => forms.some((f) => f.word_id === w.id));

  return (
    <AppShell>
      <div className="animate-rise flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("common.back")}>
          <Link to="/sets">
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.delete")}
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
        >
          <Trash2 className="size-5 text-destructive" />
        </Button>
      </div>

      <h1 className="mt-2 text-2xl font-bold">{set.name}</h1>
      <div className="mt-2 flex items-center gap-2">
        <StatePill state={status} />
        <span className="text-sm text-muted-foreground">
          {t("sets.wordCount", { count: words.length })}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("set.pair", {
          target: language(set.target_language).native,
          native: language(set.native_language).native,
        })}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1" role="tablist">
        {(["words", "forms"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-xl py-2 text-sm font-semibold transition-colors",
               tab === key ? "bg-primary-soft text-primary-deep" : "text-foreground hover:bg-card",
            )}
          >
            {t(key === "words" ? "set.tabWords" : "set.tabForms")}
          </button>
        ))}
      </div>

      {tab === "words" ? (
        <>
          <Button asChild size="lg" className="mt-4 w-full rounded-2xl">
            <Link to="/practice" search={{ set: setId, scope: "words" }}>
              <Play className="size-4" /> {t("set.trainWords")}
            </Link>
          </Button>
          <ul className="mt-5 space-y-2.5">
            {words.map((word) => {
              const progress = unitProgress(wordSkillItems(items, word.id), UNIT_SKILLS);
              return (
                <li key={word.id}>
                  <Link
                    to="/sets/$setId/words/$wordId"
                    params={{ setId, wordId: word.id }}
                    className="card-surface flex items-center gap-3 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-bold" lang={set.target_language}>
                          {word.text}
                        </p>
                        {word.part_of_speech ? (
                          <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[0.65rem] font-semibold text-primary-deep">
                            {posLabel(t as never, word.part_of_speech)}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {word.translation ?? word.meaning}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <MasteryBar value={progress} className="h-1.5" />
                        <span className="text-xs font-bold text-primary">{progress}%</span>
                        <StatePill
                          state={wordStatuses.get(word.id) ?? "new"}
                          className="shrink-0 px-2 py-0.5 text-[0.6rem]"
                        />
                      </div>
                    </div>
                    <ChevronRight
                      aria-hidden
                      className="size-5 shrink-0 text-muted-foreground rtl:rotate-180"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : !formsGenerated ? (
        <div className="card-surface mt-4 p-6 text-center">
          <Sparkles className="mx-auto size-7 text-accent" />
          <p className="mt-3 text-sm font-semibold">{t("set.noForms")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("set.noFormsHint")}</p>
          <Button
            className="mt-4 rounded-xl"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("set.creatingForms")}
              </>
            ) : (
              t("set.createForms")
            )}
          </Button>
          {generate.error ? (
            <p className="mt-3 text-xs text-destructive">{generate.error.message}</p>
          ) : null}
        </div>
      ) : wordsWithForms.length === 0 ? (
        <p className="card-surface mt-4 p-5 text-sm text-muted-foreground">
          {t("set.noApplicable")}
        </p>
      ) : (
        <>
          <Button asChild size="lg" className="mt-4 w-full rounded-2xl">
            <Link to="/practice" search={{ set: setId, scope: "forms" }}>
              <Play className="size-4" /> {t("set.trainForms")}
            </Link>
          </Button>
          <ul className="mt-5 space-y-3">
            {wordsWithForms.map((word) => (
              <li key={word.id} className="card-surface p-4">
                <div className="flex items-center gap-2">
                  <p className="text-base font-bold" lang={set.target_language}>
                    {word.text}
                  </p>
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[0.65rem] font-semibold text-primary-deep">
                    {(word as { forms_category?: string | null }).forms_category ||
                      (word.part_of_speech ? posLabel(t as never, word.part_of_speech) : "")}
                  </span>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {forms
                    .filter((f) => f.word_id === word.id)
                    .map((form) => {
                      const progress = unitProgress(formSkillItems(items, form.id), FORM_SKILLS);
                      return (
                        <li key={form.id}>
                          <Link
                            to="/sets/$setId/forms/$formId"
                            params={{ setId, formId: form.id }}
                            className="flex items-center gap-3 py-2.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold" lang={set.target_language}>
                                {form.text}
                              </p>
                              <p className="truncate text-[0.7rem] text-muted-foreground">
                                {form.form_label}
                              </p>
                            </div>
                            <MasteryBar value={progress} className="h-1.5 w-20" />
                            <span className="w-9 text-end text-xs font-bold text-primary">
                              {progress}%
                            </span>
                            <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </AppShell>
  );
}
