import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, RotateCcw, SkipForward, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLearner } from "@/components/verba/AppGate";
import { PremiumCrown, PremiumGate } from "@/components/verba/Premium";
import { MasteryBar } from "@/components/verba/MasteryPill";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { evaluateSentence, type SentenceEvaluation } from "@/lib/verba/sentence.functions";
import { handleAuthFailure } from "@/lib/verba/session-token";
import { usePlan } from "@/lib/verba/plan";
import type { Word } from "@/lib/verba/types";

type Attempt = SentenceEvaluation & { sentence: string };

/**
 * Optional sentence writing after training. Runs after the review is already
 * completed and saved; attempts are stored only in `sentence_attempts`, never
 * touching points, mastery or schedules. Skipped words are not recorded.
 */
export function SentencePractice({
  title,
  words,
  targetLanguageName,
  nativeLanguageName,
  targetCode,
  trainingId,
  onFinish,
}: {
  title: string;
  words: Word[];
  targetLanguageName: string;
  nativeLanguageName: string;
  targetCode: string;
  trainingId: string | null;
  onFinish: () => void;
}) {
  const { t } = useI18n();
  const evaluate = useServerFn(evaluateSentence);
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [history, setHistory] = useState<Record<string, Attempt[]>>({});
  const [showResult, setShowResult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = words[index] as Word;
  const attempts = history[word.id] ?? [];
  const latest = showResult ? attempts[attempts.length - 1] : undefined;

  const check = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const result = await evaluate({
        data: { word: word.text, sentence: value, targetLanguage: targetLanguageName, nativeLanguage: nativeLanguageName },
      });
      // History only; failures to save never block learning.
      void supabase
        .from("sentence_attempts")
        .insert({
          word_id: word.id,
          training_session_id: trainingId,
          sentence: value,
          is_correct: result.correct,
          corrected: result.corrected,
          explanation: [result.feedback, result.why].filter(Boolean).join("\n"),
        })
        .then(() => undefined);
      setHistory((h) => ({ ...h, [word.id]: [...(h[word.id] ?? []), { ...result, sentence: value }] }));
      setShowResult(true);
    } catch (e) {
      const signedOut = await handleAuthFailure(e);
      setError(signedOut ? t("auth.expired") : e instanceof Error ? e.message : t("review.evalFailed"));
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (index + 1 >= words.length) return onFinish();
    setIndex(index + 1);
    setText("");
    setShowResult(false);
    setError(null);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-6 pb-8">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-muted-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{t("review.sentenceStep")}</p>
          </div>
          <span className="text-sm font-bold text-primary">
            {t("practice.progress", { current: index + 1, total: words.length })}
          </span>
          <Button variant="ghost" size="icon" aria-label={t("review.skipToResults")} onClick={onFinish}>
            <X className="size-5" />
          </Button>
        </div>
        <MasteryBar value={(index / words.length) * 100} className="mt-3" />
      </header>

      <div className="card-surface p-5">
        <p className="text-xs font-semibold text-muted-foreground">{t("review.sentencePrompt")}</p>
        <p className="mt-2 text-2xl font-bold" lang={targetCode}>{word.text}</p>
        {word.translation ? <p className="mt-1 text-sm text-muted-foreground">{word.translation}</p> : null}
        {!latest ? (
          <>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              lang={targetCode}
              dir="auto"
              disabled={busy}
              placeholder={t("review.sentencePlaceholder")}
              className="mt-4 min-h-24 rounded-xl"
            />
            {error ? <p className="mt-2 text-xs text-destructive" role="alert">{error}</p> : null}
          </>
        ) : null}
      </div>

      {latest ? (
        <div className="card-surface mt-4 space-y-3 p-5 text-sm">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t("review.yourSentence")}</p>
            <p className="mt-1 font-medium" lang={targetCode} dir="auto">{latest.sentence}</p>
          </div>
          <p
            className={cn(
              "flex w-fit items-center gap-2 rounded-full px-3 py-1 font-semibold",
              latest.correct ? "bg-primary-soft text-primary-deep" : "bg-destructive/10 text-destructive",
            )}
          >
            {latest.correct ? <Check className="size-4" /> : <X className="size-4" />}
            {latest.correct ? t("word.correct") : t("review.needsWork")}
          </p>
          {latest.corrected ? (
            <p className="rounded-xl bg-primary-soft p-3 font-semibold text-primary-deep" lang={targetCode} dir="auto">
              {latest.corrected}
            </p>
          ) : null}
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{t("review.mistakes")}</p>
            <p className="mt-1" dir="auto">{latest.feedback}</p>
          </div>
          {latest.why ? (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t("review.whyBetter")}</p>
              <p className="mt-1" dir="auto">{latest.why}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-2.5">
        {latest ? (
          <>
            <Button size="lg" className="w-full rounded-2xl" onClick={() => setShowResult(false)}>
              <RotateCcw className="size-4" /> {t("review.tryAgain")}
            </Button>
            <Button size="lg" variant="secondary" className="w-full rounded-2xl" onClick={next}>
              {t("common.continue")}
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" className="w-full rounded-2xl" onClick={() => void check()} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : error ? <RotateCcw className="size-4" /> : null}
              {error ? t("review.retryEval") : t("review.submitSentence")}
            </Button>
            <Button size="lg" variant="ghost" className="w-full rounded-2xl" onClick={next} disabled={busy}>
              <SkipForward className="size-4 rtl:rotate-180" /> {t("review.skipWord")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function SentenceInvite({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const { t } = useI18n();
  const { deviceId } = useLearner();
  const { isPremium } = usePlan(deviceId);
  const [gated, setGated] = useState(false);
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="card-surface w-full p-6">
        <h1 className="text-xl font-bold">{t("review.inviteTitle")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("review.inviteBody")}</p>
      </div>
      {gated ? <PremiumGate className="mt-6" body={t("premium.offerBody")} onClose={() => setGated(false)} /> : null}
      <Button size="lg" className="mt-8 w-full rounded-2xl" onClick={() => (isPremium ? onStart() : setGated(true))}>
        <PremiumCrown /> {t("review.startSentences")}
      </Button>
      <Button size="lg" variant="secondary" className="mt-3 w-full rounded-2xl" onClick={onSkip}>
        {t("review.skipToResults")}
      </Button>
    </div>
  );
}
