import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, RotateCcw, SkipForward, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MasteryBar } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SentenceEntry } from "@/lib/verba/reviews";
import { evaluateSentence } from "@/lib/verba/sentence.functions";
import { handleAuthFailure } from "@/lib/verba/session-token";
import type { Word } from "@/lib/verba/types";

/**
 * Sentence practice at the end of an Original Words review: every word, in
 * saved order. Each answer and its evaluation is saved as soon as it exists,
 * so a refresh or exit never loses completed work.
 */
export function SentencePractice({
  title,
  words,
  targetLanguageName,
  nativeLanguageName,
  targetCode,
  initialIndex,
  initialEntries,
  onSave,
  onFinish,
  onExit,
}: {
  title: string;
  words: Word[];
  targetLanguageName: string;
  nativeLanguageName: string;
  targetCode: string;
  initialIndex: number;
  initialEntries: Record<string, SentenceEntry>;
  onSave: (index: number, entries: Record<string, SentenceEntry>) => Promise<void>;
  onFinish: () => void;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const evaluate = useServerFn(evaluateSentence);
  const [index, setIndex] = useState(Math.min(initialIndex, words.length - 1));
  const [entries, setEntries] = useState(initialEntries);
  const word = words[index] as Word;
  const entry = entries[word.id];
  const [text, setText] = useState(entry?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persist = async (nextIndex: number, next: Record<string, SentenceEntry>) => {
    setEntries(next);
    await onSave(nextIndex, next).catch(() => toast.error(t("review.saveFailed")));
  };

  const check = async () => {
    const value = text.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const result = await evaluate({
        data: {
          word: word.text,
          sentence: value,
          targetLanguage: targetLanguageName,
          nativeLanguage: nativeLanguageName,
        },
      });
      await persist(index, {
        ...entries,
        [word.id]: {
          text: value,
          status: "evaluated",
          correct: result.correct,
          feedback: result.feedback,
          corrected: result.corrected,
        },
      });
    } catch (e) {
      // Keep the learner's answer; allow retrying. Never mark it as evaluated.
      await persist(index, { ...entries, [word.id]: { text: value, status: "failed" } });
      const signedOut = await handleAuthFailure(e);
      setError(signedOut ? t("auth.expired") : e instanceof Error ? e.message : t("review.evalFailed"));
    } finally {
      setBusy(false);
    }
  };

  const advance = async (next: Record<string, SentenceEntry>) => {
    if (index + 1 >= words.length) {
      await persist(index + 1, next);
      onFinish();
      return;
    }
    await persist(index + 1, next);
    const nextWord = words[index + 1] as Word;
    setIndex(index + 1);
    setText(next[nextWord.id]?.text ?? "");
    setError(null);
  };

  const skip = () =>
    void advance({ ...entries, [word.id]: { text: text.trim(), status: "skipped" } });

  const evaluated = entry?.status === "evaluated";

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
          <Button variant="ghost" size="icon" aria-label={t("train.exit")} onClick={onExit}>
            <X className="size-5" />
          </Button>
        </div>
        <MasteryBar value={(index / words.length) * 100} className="mt-3" />
      </header>

      <div className="card-surface p-5">
        <p className="text-xs font-semibold text-muted-foreground">{t("review.sentencePrompt")}</p>
        <p className="mt-2 text-2xl font-bold" lang={targetCode}>
          {word.text}
        </p>
        {word.translation ? (
          <p className="mt-1 text-sm text-muted-foreground">{word.translation}</p>
        ) : null}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          lang={targetCode}
          dir="auto"
          disabled={busy || evaluated}
          placeholder={t("review.sentencePlaceholder")}
          className="mt-4 min-h-24 rounded-xl"
        />
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

        {evaluated ? (
          <div
            className={cn(
              "mt-4 rounded-xl p-4 text-sm",
              entry.correct ? "bg-primary-soft text-primary-deep" : "bg-destructive/10 text-destructive",
            )}
          >
            <p className="flex items-center gap-2 font-semibold">
              {entry.correct ? <Check className="size-4" /> : <X className="size-4" />}
              {entry.correct ? t("word.correct") : t("review.needsWork")}
            </p>
            <p className="mt-1 text-foreground">{entry.feedback}</p>
            {entry.corrected ? (
              <p className="mt-2 font-semibold text-foreground" lang={targetCode}>
                {entry.corrected}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-2.5">
        {evaluated ? (
          <Button size="lg" className="w-full rounded-2xl" onClick={() => void advance(entries)}>
            {t("common.continue")}
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full rounded-2xl"
            onClick={() => void check()}
            disabled={busy || !text.trim()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : error ? <RotateCcw className="size-4" /> : null}
            {error ? t("review.retryEval") : t("review.checkSentence")}
          </Button>
        )}
        {!evaluated ? (
          <Button size="lg" variant="ghost" className="w-full rounded-2xl" onClick={skip} disabled={busy}>
            <SkipForward className="size-4 rtl:rotate-180" /> {t("review.skip")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
