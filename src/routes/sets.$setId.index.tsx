import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Loader2, Pencil, Play, Sparkles, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { posLabel } from "@/lib/verba/pos";
import { MasteryBar, StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { language } from "@/lib/i18n/languages";
import { PremiumCrown, PremiumGate } from "@/components/verba/Premium";
import { usePlan } from "@/lib/verba/plan";
import { createForms, deleteSet, getSet, renameSet } from "@/lib/verba/api";
import { prepareSet, wordReady } from "@/lib/verba/analysis";
import {
  FORM_SKILLS,
  UNIT_SKILLS,
  formSkillItems,
  unitProgress,
  wordSkillItems,
  wordStatus,
} from "@/lib/verba/progress";
import { cn } from "@/lib/utils";
import { unitState } from "@/lib/verba/reviews";
import { countdown } from "@/lib/verba/schedule";
import { useReviewUnits } from "@/lib/verba/use-review-units";

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
  const { units, now } = useReviewUnits(deviceId);
  const { locale } = useI18n();
  const scheduleLine = (kind: "words" | "forms") => {
    const unit = units?.find((u) => u.setId === setId && u.kind === kind);
    if (!unit) return null;
    const state = unitState(unit, now);
    const label =
      state === "upcoming" && unit.nextReviewAt
        ? `${t("review.nextIn")} ${countdown(unit.nextReviewAt, locale, now)}`
        : t(`review.state.${state}` as never);
    return (
      <p
        className={cn(
          "mt-2 text-center text-xs",
          state === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
    );
  };

  const remove = useMutation({
    mutationFn: () => deleteSet(setId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sets"] });
      void navigate({ to: "/sets" });
    },
  });

  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState(false);
  const rename = useMutation({
    mutationFn: (name: string) => renameSet(setId, name),
    onSuccess: async () => {
      setRenaming(false);
      await queryClient.invalidateQueries({ queryKey: ["set", setId] });
      await queryClient.invalidateQueries({ queryKey: ["sets"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
  const submitRename = () => {
    const value = newName.trim();
    if (!value) return setNameError(true);
    rename.mutate(value);
  };

  const reanalyze = useMutation({
    mutationFn: () => prepareSet(deviceId, setId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["set", setId] }),
  });

  const { isPremium } = usePlan(deviceId);
  const [formsGated, setFormsGated] = useState(false);
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
  const formCount = new Set(forms.filter((f) => words.some((w) => w.id === f.word_id)).map((f) => f.id)).size;
  const counts = { words: words.length, forms: formCount };
  const unready = words.filter((w) => (w.analysis_status ?? "ready") !== "ready" || !w.translation);

  return (
    <AppShell>
      <div className="animate-rise flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("common.back")}>
          <Link to="/sets">
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
        </Button>
        <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("common.rename")}
          onClick={() => {
            setNewName(set.name);
            setNameError(false);
            setRenaming(true);
          }}
        >
          <Pencil className="size-5" />
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
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sets.renameTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitRename();
            }}
          >
            <Input
              autoFocus
              dir="auto"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setNameError(false);
              }}
              aria-label={t("sets.renameTitle")}
              className="h-12 rounded-2xl"
            />
            {nameError ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{t("sets.nameRequired")}</p> : null}
            {rename.isError ? <p className="mt-2 text-xs font-semibold text-destructive" role="alert">{t("add.failed")}</p> : null}
            <DialogFooter className="mt-4 flex-row gap-2">
              <Button type="button" variant="secondary" className="flex-1 rounded-xl" onClick={() => setRenaming(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" className="flex-1 rounded-xl" disabled={rename.isPending}>
                {rename.isPending ? <Loader2 className="size-4 animate-spin" /> : null} {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <h1 className="mt-2 text-2xl font-bold">{set.name}</h1>
      <div className="mt-2 flex items-center gap-2">
        <StatePill state={status} />
        <span className="text-sm text-muted-foreground">
          {t("sets.totalItems", { count: words.length + formCount })}
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
            {t(key === "words" ? "set.tabWords" : "set.tabForms")} ({counts[key]})
          </button>
        ))}
      </div>

      {tab === "words" ? (
        <>
          {unready.length > 0 ? (
            <div className="card-surface mt-4 p-4 text-sm" role="status">
              <p className="font-semibold">
                {reanalyze.isPending ? t("set.analyzing") : t("set.analysisPending", { count: unready.length })}
              </p>
              <Button
                variant="secondary"
                className="mt-3 w-full rounded-xl"
                onClick={() => reanalyze.mutate()}
                disabled={reanalyze.isPending}
              >
                {reanalyze.isPending ? <Loader2 className="size-4 animate-spin" /> : null} {t("set.retryAnalysis")}
              </Button>
            </div>
          ) : null}
          <Button asChild size="lg" className="mt-4 w-full rounded-2xl">
            <Link to="/practice" search={{ set: setId, review: "words" }}>
              <Play className="size-4" /> {t("review.reviewWords")}
            </Link>
          </Button>
          {scheduleLine("words")}
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
                      {word.analysis_status === "failed" ? (
                        <p className="truncate text-xs font-semibold text-destructive">{t("set.analysisFailed")}</p>
                      ) : !wordReady(word) && !word.translation ? (
                        <p className="truncate text-xs text-muted-foreground">{t("set.analyzing")}</p>
                      ) : (
                        <p className="truncate text-xs text-muted-foreground">
                          {word.translation ?? word.meaning}
                        </p>
                      )}
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
            onClick={() => (isPremium ? generate.mutate() : setFormsGated(true))}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t("set.creatingForms")}
              </>
            ) : (
              <>
                <PremiumCrown /> {t("set.createForms")}
              </>
            )}
          </Button>
          {formsGated ? <PremiumGate className="mt-4" body={t("premium.formsBody")} onClose={() => setFormsGated(false)} /> : null}
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
            <Link to="/practice" search={{ set: setId, review: "forms" }}>
              <Play className="size-4" /> {t("review.reviewForms")}
            </Link>
          </Button>
          {scheduleLine("forms")}
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
