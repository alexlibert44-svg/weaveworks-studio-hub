import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { TrainingResults } from "@/components/verba/TrainingResults";
import { prepareSet, setReadiness } from "@/lib/verba/analysis";
import { completeTrainingSession, startTrainingSession, type TrainingResult } from "@/lib/verba/training";

import { Button } from "@/components/ui/button";
import { useLearner } from "@/components/verba/AppGate";
import { SentencePractice } from "@/components/verba/SentencePractice";
import { Session } from "@/components/verba/Session";
import { useI18n } from "@/lib/i18n";
import { language, speechLocale } from "@/lib/i18n/languages";
import { buildQueue, getSet } from "@/lib/verba/api";
import {
  buildReviewSequence,
  completeReviewSession,
  openReviewSession,
  saveSessionProgress,
  type ReviewOutcome,
} from "@/lib/verba/reviews";
import { countdown, type ReviewKind } from "@/lib/verba/schedule";
import type { Skill, Word } from "@/lib/verba/types";

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);

export const Route = createFileRoute("/practice")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    set?: string | undefined;
    skill?: Skill | undefined;
    word?: string | undefined;
    form?: string | undefined;
    scope?: "words" | "forms" | undefined;
    review?: ReviewKind | undefined;
  } => ({
    ...(str(search["word"]) ? { word: str(search["word"]) as string } : {}),
    ...(str(search["form"]) ? { form: str(search["form"]) as string } : {}),
    ...(search["scope"] === "words" || search["scope"] === "forms"
      ? { scope: search["scope"] as "words" | "forms" }
      : {}),
    ...(search["review"] === "words" || search["review"] === "forms"
      ? { review: search["review"] as ReviewKind }
      : {}),
    ...(str(search["set"]) ? { set: str(search["set"]) as string } : {}),
    ...(str(search["skill"]) ? { skill: str(search["skill"]) as Skill } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Practice Session — LingoFlow" },
      {
        name: "description",
        content:
          "A focused LingoFlow session: listen, write, speak and recall your words inside real sentences.",
      },
      { property: "og:title", content: "Practice Session — LingoFlow" },
      {
        property: "og:description",
        content: "One objective at a time: writing, speaking, recall, sentences and forms.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PracticePage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center px-6 text-center" role="alert">
      <div>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
        <Button asChild className="mt-4 rounded-xl">
          <Link to="/">Home</Link>
        </Button>
      </div>
    </div>
  ),
  notFoundComponent: () => <p className="p-8 text-center">Nothing to practice here.</p>,
});

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-7 animate-spin text-primary" />
    </div>
  );
}

function PracticePage() {
  const { set: setId, review, scope } = Route.useSearch();
  const body = setId && review ? <ReviewRun setId={setId} kind={review} /> : <ExtraPractice />;
  if (!setId) return body;
  return (
    <PreparedGate key={`${setId}-${review ?? scope ?? ""}`} setId={setId} kind={review ?? scope ?? "words"}>
      {body}
    </PreparedGate>
  );
}

/**
 * Training only starts once every word has its saved analysis. Older sets that
 * predate saved quiz options are prepared here once, before the session begins.
 */
function PreparedGate({ setId, kind, children }: { setId: string; kind: ReviewKind; children: React.ReactNode }) {
  const { deviceId } = useLearner();
  const { t } = useI18n();
  const [preparing, setPreparing] = useState(false);
  const tried = useRef(false);
  const { data, refetch, error } = useQuery({
    queryKey: ["readiness", setId, kind],
    queryFn: () => setReadiness(setId, kind),
    gcTime: 0,
  });
  useEffect(() => {
    if (!data || data.ready || data.failed > 0 || tried.current) return;
    tried.current = true;
    setPreparing(true);
    void prepareSet(deviceId, setId)
      .catch(() => undefined)
      .finally(() => {
        setPreparing(false);
        void refetch();
      });
  }, [data, deviceId, setId, refetch]);

  if (error) throw error;
  if (!data || preparing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="size-7 animate-spin text-primary" />
        {preparing ? <p className="text-sm text-muted-foreground">{t("practice.preparing")}</p> : null}
      </div>
    );
  }
  // Forms without options still train (the meaning step says so); words must be ready.
  if (data.notReady > 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <Sparkles className="size-9 text-accent" />
        <h1 className="mt-5 text-xl font-bold">{t("practice.notReady")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("practice.notReadyBody")}</p>
        <Button asChild size="lg" className="mt-8 w-full rounded-2xl">
          <Link to="/sets/$setId" params={{ setId }}>{t("common.continue")}</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <Sparkles className="size-9 text-accent" />
      <h1 className="mt-5 text-xl font-bold">{t("practice.empty")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("practice.emptyBody")}</p>
      <Button asChild size="lg" className="mt-8 w-full rounded-2xl">
        <Link to="/">{t("practice.doneHome")}</Link>
      </Button>
    </div>
  );
}

/** Word Set review run: resumable, completes the schedule only at the very end. */
function ReviewRun({ setId, kind }: { setId: string; kind: ReviewKind }) {
  const { deviceId } = useLearner();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [phaseOverride, setPhaseOverride] = useState<"sentences" | "done" | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [training, setTraining] = useState<{ id: string; seconds: number; sentencesFrom: number } | null>(null);
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const { learner } = useLearner();

  const { data, isPending, error } = useQuery({
    queryKey: ["review-run", setId, kind],
    queryFn: async () => {
      const [session, exercises, setInfo] = await Promise.all([
        openReviewSession(setId, kind),
        buildReviewSequence(setId, kind),
        getSet(setId),
      ]);
      return { session, exercises, setInfo };
    },
    staleTime: Infinity,
    gcTime: 0,
  });

  const words = useMemo(() => {
    const seen = new Map<string, Word>();
    for (const e of data?.exercises ?? []) if (!seen.has(e.word.id)) seen.set(e.word.id, e.word);
    return [...seen.values()];
  }, [data]);

  const refreshAll = () => {
    for (const key of [["review-units", deviceId], ["sets", deviceId], ["set", setId], ["daily", deviceId], ["learner", deviceId], ["stats", deviceId], ["language-streak", deviceId], ["points", deviceId]]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const backToSet = () => {
    refreshAll();
    void navigate({
      to: "/sets/$setId",
      params: { setId },
      search: kind === "forms" ? { tab: "forms" } : {},
    });
  };

  if (error) throw error;
  if (isPending || !data) return <Spinner />;
  if (data.exercises.length === 0) return <EmptyState />;

  const { session, setInfo } = data;
  const phase = phaseOverride ?? session?.phase ?? "units";

  const saveTraining = async (info: { id: string; seconds: number; sentencesFrom: number } | null) => {
    setResultError(null);
    try {
      let current = info;
      if (!current) {
        // Resumed straight into the sentence step: track it as its own session.
        current = { id: crypto.randomUUID(), seconds: 0, sentencesFrom: Date.now() };
      }
      await startTrainingSession({
        id: current.id,
        setId,
        kind,
        targetLanguage: setInfo.set.target_language ?? learner.learning_language,
      });
      const sentenceSeconds = current.sentencesFrom ? (Date.now() - current.sentencesFrom) / 1000 : 0;
      setResult(await completeTrainingSession(current.id, current.seconds + sentenceSeconds));
      refreshAll();
    } catch (e) {
      setResultError(e instanceof Error ? e.message : String(e));
    }
  };

  const finishAll = async (info = training) => {
    setFinishing(true);
    setFinishError(null);
    try {
      if (session) setOutcome(await completeReviewSession(session.id));
      refreshAll();
      setPhaseOverride("done");
      void saveTraining(info);
    } catch (e) {
      // Never show "complete" unless the schedule was actually saved.
      setFinishError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinishing(false);
    }
  };

  if (finishError || finishing) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        {finishing ? (
          <Spinner />
        ) : (
          <>
            <p className="text-sm text-destructive" role="alert">{t("review.saveFailed")}</p>
            <Button size="lg" className="mt-6 w-full rounded-2xl" onClick={() => void finishAll()}>
              {t("review.retryEval")}
            </Button>
          </>
        )}
      </div>
    );
  }

  if (phase === "done") {
    return (
      <TrainingResults
        result={result}
        error={resultError}
        onRetrySave={() => void saveTraining(training)}
        onFinish={backToSet}
        onTrainAgain={() => {
          refreshAll();
          void navigate({ to: "/practice", search: { set: setId, scope: kind } });
        }}
        note={
          outcome?.next_review_at
            ? t("review.outcomeNext", { when: countdown(outcome.next_review_at, locale) })
            : null
        }
      />
    );
  }

  if (phase === "sentences" && kind === "words") {
    return (
      <SentencePractice
        title={setInfo.set.name}
        words={words}
        targetCode={setInfo.set.target_language}
        targetLanguageName={language(setInfo.set.target_language).english}
        nativeLanguageName={language(setInfo.set.native_language).english}
        initialIndex={session?.phase === "sentences" ? session.position : 0}
        initialEntries={session?.state.sentences ?? {}}
        onSave={async (index, entries) => {
          if (session)
            await saveSessionProgress(session.id, {
              phase: "sentences",
              position: index,
              state: { ...session.state, sentences: entries },
            });
        }}
        onFinish={() => void finishAll()}
        onExit={backToSet}
      />
    );
  }

  return (
    <Session
      deviceId={deviceId}
      exercises={data.exercises}
      title={setInfo.set.name}
      locale={speechLocale(setInfo.set.target_language)}
      targetLanguage={setInfo.set.target_language}
      initialIndex={session?.phase === "units" ? session.position : 0}
      onProgress={(index) => {
        if (session) void saveSessionProgress(session.id, { position: index }).catch(() => undefined);
      }}
      onFinished={refreshAll}
      onComplete={(info) => {
        const next = { id: info.trainingId, seconds: info.activeSeconds, sentencesFrom: 0 };
        if (kind === "words") {
          next.sentencesFrom = Date.now();
          setTraining(next);
          if (session)
            void saveSessionProgress(session.id, { phase: "sentences", position: 0 }).catch(() => undefined);
          setPhaseOverride("sentences");
        } else {
          setTraining(next);
          void finishAll(next);
        }
      }}
      onExit={backToSet}
    />
  );
}

/** Extra practice (single word, single form, set drills): never changes the review schedule. */
function ExtraPractice() {
  const { set: setId, skill, word, form, scope } = Route.useSearch();
  const { deviceId, learner } = useLearner();
  const { t, targetSpeech } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const filters = {
    setId: setId ?? null,
    skill: skill ?? null,
    wordId: word ?? null,
    formId: form ?? null,
    scope: scope ?? null,
  };

  const { data: exercises, isPending, refetch } = useQuery({
    queryKey: ["queue", deviceId, learner.learning_language, setId ?? "", skill ?? "", word ?? "", form ?? "", scope ?? ""],
    queryFn: () => buildQueue(deviceId, filters, learner.learning_language),
    staleTime: Infinity,
    gcTime: 0,
    enabled: Boolean(setId || word || form),
  });

  const { data: setInfo } = useQuery({
    queryKey: ["set", setId],
    queryFn: () => getSet(setId as string),
    enabled: Boolean(setId),
  });

  if (!setId && !word && !form) return <EmptyState />;
  if (isPending) return <Spinner />;
  if (!exercises || exercises.length === 0) return <EmptyState />;

  const locale = setInfo ? speechLocale(setInfo.set.target_language) : targetSpeech;
  const title = setInfo?.set.name ?? t("nav.sets");

  return (
    <Session
      deviceId={deviceId}
      exercises={exercises}
      title={title}
      locale={locale}
      targetLanguage={setInfo?.set.target_language ?? learner.learning_language}
      onFinished={() => {
        void queryClient.invalidateQueries({ queryKey: ["sets", deviceId] });
        void queryClient.invalidateQueries({ queryKey: ["daily", deviceId] });
        void queryClient.invalidateQueries({ queryKey: ["learner", deviceId] });
        void queryClient.invalidateQueries({ queryKey: ["stats", deviceId] });
        void queryClient.invalidateQueries({ queryKey: ["language-streak", deviceId] });
        void queryClient.invalidateQueries({ queryKey: ["points", deviceId] });
        if (setId) void queryClient.invalidateQueries({ queryKey: ["set", setId] });
        if (word) void queryClient.invalidateQueries({ queryKey: ["word", word] });
        if (form) void queryClient.invalidateQueries({ queryKey: ["form", form] });
      }}
      onExit={
        word && setId
          ? () => {
              void queryClient.invalidateQueries({ queryKey: ["word", word] });
              void queryClient.invalidateQueries({ queryKey: ["set", setId] });
              void navigate({ to: "/sets/$setId/words/$wordId", params: { setId, wordId: word } });
            }
          : undefined
      }
      onRestart={() => {
        void refetch();
      }}
    />
  );
}
