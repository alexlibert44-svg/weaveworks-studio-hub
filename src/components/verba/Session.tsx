import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Loader2,
  Mic,
  PartyPopper,
  Play,
  RotateCcw,
  X,
  Lightbulb,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MasteryBar } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { logSession, recordAttempt, recordPronunciation } from "@/lib/verba/api";
import {
  evaluatePronunciation,
  type PronunciationResult,
} from "@/lib/verba/pronunciation.functions";
import { posLabel } from "@/lib/verba/pos";
import { speak } from "@/lib/verba/speech";
import { SpeakButton } from "@/components/verba/SpeakButton";
import { TappableSentence } from "@/components/verba/TappableSentence";
import { normalize, similarity } from "@/lib/verba/srs";
import type { Exercise, LearningItem, Sentence, Skill, Word } from "@/lib/verba/types";

/** Builds a cloze prompt by hiding the target word inside its sentence. */
export function cloze(sentence: string, word: string) {
  const stem = normalize(word).slice(0, Math.max(2, word.length - 2));
  const tokens = sentence.split(/(\s+)/);
  const targetIndex = tokens.findIndex((token) => normalize(token).startsWith(stem));
  if (targetIndex === -1) {
    return { prompt: sentence.replace(word, "____"), answer: word };
  }
  const answer = normalize(tokens[targetIndex] as string);
  const masked = tokens.slice();
  masked[targetIndex] = "____";
  return { prompt: masked.join(""), answer };
}

/* ------------------------------ session model ------------------------------ */

type Step = "recognition" | "speak" | "write" | "meaning";
const STEPS: Step[] = ["recognition", "speak", "write", "meaning"];

interface WordUnit {
  word: Word;
  sentence: Sentence | null;
  /** Real learning items for this word, keyed by skill, used for SRS updates. */
  items: Partial<Record<Skill, LearningItem>>;
  fallbackItem: LearningItem;
}

/** Groups the SRS queue into one training unit per word, in queue order. */
function buildUnits(exercises: Exercise[]): WordUnit[] {
  const order: string[] = [];
  const byWord = new Map<string, WordUnit>();
  for (const exercise of exercises) {
    const id = exercise.word.id;
    let unit = byWord.get(id);
    if (!unit) {
      unit = {
        word: exercise.word,
        sentence: exercise.sentence,
        items: {},
        fallbackItem: exercise.item,
      };
      byWord.set(id, unit);
      order.push(id);
    }
    if (!unit.sentence && exercise.sentence) unit.sentence = exercise.sentence;
    if (!unit.items[exercise.skill]) unit.items[exercise.skill] = exercise.item;
  }
  return order.map((id) => byWord.get(id) as WordUnit);
}

interface SessionProps {
  deviceId: string;
  exercises: Exercise[];
  title: string;
  /** BCP-47 tag of the language being learned. */
  locale: string;
  onFinished: () => void;
  onRestart?: () => void;
  /** When set, exit/finish return here instead of the sets list. */
  onExit?: (() => void) | undefined;
  /** Resume a saved review session at this word index. */
  initialIndex?: number;
  /** Called when the learner moves on to the next word (persisted for resumption). */
  onProgress?: (index: number) => void;
  /** When set, the last word hands control back instead of showing the done screen. */
  onComplete?: () => void;
}

export function Session({
  deviceId,
  exercises,
  title,
  locale,
  onFinished,
  onRestart,
  onExit,
  initialIndex = 0,
  onProgress,
  onComplete,
}: SessionProps) {
  /** One training session id per mount/restart, stored with every graded attempt. */
  const sessionId = useRef<string>(crypto.randomUUID());
  const { t } = useI18n();
  const units = useMemo(() => buildUnits(exercises), [exercises]);
  const [attempt, setAttempt] = useState(0);
  const [index, setIndex] = useState(() => Math.min(initialIndex, Math.max(exercises.length - 1, 0)));
  const [step, setStep] = useState<Step>("recognition");
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({
    writeCorrect: 0,
    writeTotal: 0,
    meaningCorrect: 0,
    meaningTotal: 0,
  });
  const startedAt = useRef(Date.now());

  const unit = units[index];
  const total = units.length;

  /** Persists a real attempt against the matching learning item. */
  const record = useCallback(
    (skill: Skill, score: number, response: string | null) => {
      if (!unit) return;
      const item = unit.items[skill] ?? unit.fallbackItem;
      void recordAttempt(deviceId, item, score, response, sessionId.current).catch(() => undefined);
    },
    [deviceId, unit],
  );

  const finish = useCallback(() => {
    const minutes = Math.max(0.5, Math.round(((Date.now() - startedAt.current) / 60000) * 10) / 10);
    void logSession(deviceId, minutes, total).catch(() => undefined);
    onFinished();
    if (onComplete) onComplete();
    else setDone(true);
  }, [deviceId, onFinished, onComplete, total]);

  const next = () => {
    const position = STEPS.indexOf(step);
    if (position < STEPS.length - 1) {
      setStep(STEPS[position + 1] as Step);
      return;
    }
    if (index + 1 >= total) finish();
    else {
      onProgress?.(index + 1);
      setIndex((value) => value + 1);
      setStep("recognition");
    }
  };

  const restart = () => {
    setStats({ writeCorrect: 0, writeTotal: 0, meaningCorrect: 0, meaningTotal: 0 });
    setIndex(0);
    setStep("recognition");
    setDone(false);
    startedAt.current = Date.now();
    sessionId.current = crypto.randomUUID();
    setAttempt((value) => value + 1);
    onRestart?.();
  };

  if (done || !unit) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-lg bg-primary-soft text-primary shadow-card">
          <PartyPopper className="size-9" />
        </span>
        <h1 className="mt-6 text-2xl font-bold">{t("practice.done")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("practice.doneBody", { count: total, minutes })}
        </p>
        <div className="card-surface mt-6 w-full space-y-2 p-5 text-start text-sm">
          <ResultRow label={t("train.resultWords")} value={`${total}`} />
          <ResultRow
            label={t("train.resultWriting")}
            value={`${stats.writeCorrect}/${stats.writeTotal}`}
          />
          <ResultRow
            label={t("train.resultMeaning")}
            value={`${stats.meaningCorrect}/${stats.meaningTotal}`}
          />
        </div>
        <Button size="lg" className="mt-6 w-full rounded-2xl" onClick={restart}>
          <RotateCcw className="size-4" /> {t("train.restart")}
        </Button>
        {onExit ? (
          <Button size="lg" variant="secondary" className="mt-2.5 w-full rounded-2xl" onClick={onExit}>
            {t("train.exit")}
          </Button>
        ) : (
          <Button asChild size="lg" variant="secondary" className="mt-2.5 w-full rounded-2xl">
            <Link to="/sets">{t("train.exit")}</Link>
          </Button>
        )}
      </div>
    );
  }

  const progress = ((index + STEPS.indexOf(step) / STEPS.length) / total) * 100;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 pt-6 pb-8">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-muted-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{t(`train.step.${step}` as never)}</p>
          </div>
          <span className="text-sm font-bold text-primary">
            {t("practice.progress", { current: index + 1, total })}
          </span>
          {onExit ? (
            <Button variant="ghost" size="icon" aria-label={t("train.exit")} onClick={onExit}>
              <X className="size-5" />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="icon" aria-label={t("train.exit")}>
              <Link to="/sets">
                <X className="size-5" />
              </Link>
            </Button>
          )}
        </div>
        <MasteryBar value={progress} className="mt-3" />
      </header>

      {step === "recognition" ? (
        <RecognitionStep
          key={`r-${attempt}-${unit.word.id}`}
          unit={unit}
          locale={locale}
          onReady={() => {
            record("recognition", 0.75, null);
            next();
          }}
        />
      ) : step === "speak" ? (
        <SpeakStep
          key={`s-${attempt}-${unit.word.id}`}
          unit={unit}
          locale={locale}
          deviceId={deviceId}
          onDone={(score, note) => {
            // No recording means no assessment: nothing is stored for pronunciation.
            if (note !== "mic-denied") record("speaking", score, note);
            next();
          }}
        />
      ) : step === "write" ? (
        <WriteStep
          key={`w-${attempt}-${unit.word.id}`}
          unit={unit}
          locale={locale}
          onDone={(score, response) => {
            record("writing", score, response);
            setStats((s) => ({
              ...s,
              writeTotal: s.writeTotal + 1,
              writeCorrect: s.writeCorrect + (score >= 0.9 ? 1 : 0),
            }));
            next();
          }}
        />
      ) : (
        <MeaningStep
          key={`m-${attempt}-${unit.word.id}`}
          unit={unit}
          units={units}
          locale={locale}
          onDone={(correct, response) => {
            record("recall", correct ? 1 : 0.2, response);
            setStats((s) => ({
              ...s,
              meaningTotal: s.meaningTotal + 1,
              meaningCorrect: s.meaningCorrect + (correct ? 1 : 0),
            }));
            next();
          }}
        />
      )}
    </div>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-primary">{value}</span>
    </div>
  );
}

/* --------------------------------- audio ---------------------------------- */

function AudioButtons({
  word,
  sentence,
  locale,
}: {
  word: string;
  sentence: string | null;
  locale: string;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-5 grid gap-2">
      <SpeakButton variant="secondary" className="w-full rounded-xl" text={word} locale={locale} label={t("train.wordAudio")} />
      {sentence ? (
        <SpeakButton variant="secondary" className="w-full rounded-xl" text={sentence} locale={locale} label={t("train.sentenceAudio")} />
      ) : null}
    </div>
  );
}

/* ------------------------------- recognition ------------------------------- */

function RecognitionStep({
  unit,
  locale,
  onReady,
}: {
  unit: WordUnit;
  locale: string;
  onReady: () => void;
}) {
  const { t } = useI18n();
  const { word, sentence } = unit;

  useEffect(() => {
    speak(word.text, locale);
  }, [word.text, locale]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="card-surface animate-rise p-6 text-center">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          {t("practice.newWord")}
        </p>
        <p className="mt-3 text-3xl font-bold" lang={locale}>
          {word.text}
        </p>
        {word.pronunciation ? (
          <p className="mt-1 text-sm text-muted-foreground">{word.pronunciation}</p>
        ) : null}
        <p className="mt-3 text-base font-semibold text-primary">
          {word.translation ?? word.meaning}
        </p>
        {word.explanation && !word.form_label ? (
          <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {word.explanation}
          </p>
        ) : null}
        {word.part_of_speech && !word.form_label ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {posLabel(t as never, word.part_of_speech)}
            {word.alternative_parts_of_speech?.length
              ? ` · ${word.alternative_parts_of_speech
                  .map((alt) => posLabel(t as never, alt))
                  .join(", ")}`
              : ""}
          </p>
        ) : null}
        {sentence ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-base font-semibold" lang={locale}>
              {sentence.text}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{sentence.translation}</p>
          </div>
        ) : null}
        <AudioButtons word={word.text} sentence={sentence?.text ?? null} locale={locale} />
      </div>
      {word.form_label ? (
        <section
          aria-label={t("form.why")}
          className="animate-rise mt-4 rounded-3xl border border-primary/15 bg-primary-soft p-5"
        >
          <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-primary-deep uppercase">
            <Lightbulb className="size-4" /> {t("form.why")}
          </p>
          <p className="mt-2 text-sm font-semibold text-primary-deep">
            {t("form.of", { label: word.form_label, word: word.form_parent ?? "" })}
          </p>
          {word.form_explanation ? (
            <p className="mt-1 text-sm leading-relaxed text-foreground" dir="auto">
              {word.form_explanation}
            </p>
          ) : null}
        </section>
      ) : null}
      <p className="mt-4 text-center text-sm text-muted-foreground">{t("practice.newWordBody")}</p>
      <Button size="lg" className="mt-auto w-full rounded-2xl" onClick={onReady}>
        {t("train.ready")} <ArrowRight className="size-4 rtl:rotate-180" />
      </Button>
    </div>
  );
}

/* --------------------------------- speak ---------------------------------- */

type RecorderState = "idle" | "recording" | "analyzing" | "scored" | "denied";

function SpeakStep({
  unit,
  locale,
  deviceId,
  onDone,
}: {
  unit: WordUnit;
  locale: string;
  deviceId: string;
  onDone: (score: number, note: string | null) => void;
}) {
  const { t } = useI18n();
  const { word, sentence } = unit;
  const target = sentence?.text ?? word.text;
  const [state, setState] = useState<RecorderState>("idle");
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [best, setBest] = useState(0);
  const [tries, setTries] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  /** Sends the recording for real transcription-based scoring. */
  const analyse = async (blob: Blob) => {
    setState("analyzing");
    setError(null);
    const attemptIndex = tries + 1;
    setTries(attemptIndex);
    try {
      const buffer = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const analysis = await evaluatePronunciation({
        data: {
          audioBase64: btoa(binary),
          mimeType: blob.type || "audio/webm",
          target,
          locale,
        },
      });
      setResult(analysis);
      setBest((value) => Math.max(value, analysis.score));
      setState("scored");
      const item = unit.items["speaking"] ?? unit.fallbackItem;
      void recordPronunciation({
        deviceId,
        itemId: item.id,
        target,
        transcript: analysis.transcript,
        score: analysis.score,
        matched: analysis.matched,
        missed: analysis.missed,
        attemptIndex,
      }).catch(() => undefined);
    } catch (cause) {
      // An expired sign-in must not break the microphone: renew it silently,
      // and only ask the user to sign in again when renewal is impossible.
      const signedOut = await handleAuthFailure(cause);
      setError(
        signedOut
          ? t("auth.expired")
          : cause instanceof Error && cause.message
            ? cause.message
            : t("train.pronFailed"),
      );
      setState("idle");
    }
  };

  const start = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void analyse(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setResult(null);
      setState("recording");
    } catch {
      setState("denied");
    }
  };

  const stop = () => recorderRef.current?.stop();
  const passed = (result?.score ?? 0) >= 0.7;

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-lg font-bold">{t("practice.speakingTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("train.speakHint")}</p>

      <div className="card-surface animate-rise mt-4 p-6">
        <p className="text-2xl font-bold" lang={locale}>
          {word.text}
        </p>
        {sentence ? (
          <>
            <p className="mt-3 text-base font-semibold" lang={locale}>
              {sentence.text}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{sentence.translation}</p>
          </>
        ) : null}
        <AudioButtons word={word.text} sentence={sentence?.text ?? null} locale={locale} />
      </div>

      <div className="mt-5 space-y-2.5">
        <div className="flex flex-col items-center gap-2 py-2">
          <button
            type="button"
            onClick={() => (state === "recording" ? stop() : void start())}
            disabled={state === "analyzing"}
            aria-pressed={state === "recording"}
            aria-label={state === "recording" ? t("train.stopRecording") : t("train.record")}
            className={cn(
              "relative flex size-20 items-center justify-center rounded-full shadow-card transition focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none disabled:opacity-60",
              state === "recording"
                ? "bg-primary-deep text-primary-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary-deep",
            )}
          >
            {state === "recording" ? (
              <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent opacity-40" />
            ) : null}
            {state === "analyzing" ? (
              <Loader2 className="relative size-8 animate-spin" />
            ) : (
              <Mic className="relative size-8" />
            )}
          </button>
          <p className="text-center text-sm font-semibold text-primary" aria-live="polite">
            {state === "recording"
              ? t("practice.speakingListening")
              : state === "analyzing"
                ? t("train.analyzing")
                : tries > 0
                  ? t("train.recordAgain")
                  : t("train.record")}
          </p>
        </div>

        {result ? (
          <div
            className={cn(
              "card-surface p-4",
              passed ? "bg-success-soft" : "bg-destructive/10",
            )}
            role="status"
          >
            <p className={cn("text-sm font-bold", passed ? "text-success" : "text-destructive")}>
              {t("train.pronScore", { score: Math.round(result.score * 100) })}
            </p>
            {result.transcript ? (
              <p className="mt-1 text-sm" lang={locale}>
                {t("train.heard")}: {result.transcript}
              </p>
            ) : (
              <p className="mt-1 text-sm">{t("train.heardNothing")}</p>
            )}
            {result.matched.length > 0 ? (
              <p className="mt-2 text-xs font-semibold text-success">
                {t("train.pronGood")}: {result.matched.join(" · ")}
              </p>
            ) : null}
            {result.missed.length > 0 ? (
              <p className="mt-1 text-xs font-semibold text-destructive">
                {t("train.pronMissed")}: {result.missed.join(" · ")}
              </p>
            ) : null}
            {!passed ? (
              <p className="mt-2 text-xs font-semibold">{t("train.tryAgain")}</p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm font-semibold text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {state === "denied" ? (
          <p className="text-sm font-semibold text-destructive" role="alert">
            {t("train.micDenied")}
          </p>
        ) : null}
      </div>

      <div className="mt-auto space-y-2.5 pt-6">
        {state === "denied" ? (
          <Button
            size="lg"
            variant="secondary"
            className="w-full rounded-2xl"
            onClick={() => onDone(0, "mic-denied")}
          >
            {t("common.skip")} <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>
        ) : null}
        {result ? (
          <Button
            size="lg"
            className="w-full rounded-2xl"
            onClick={() => onDone(best, result.transcript || "no-speech")}
          >
            {t("common.next")} <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- write ---------------------------------- */

function WriteStep({
  unit,
  locale,
  onDone,
}: {
  unit: WordUnit;
  locale: string;
  onDone: (score: number, response: string) => void;
}) {
  const { t } = useI18n();
  const { word, sentence } = unit;

  // The target-language sentence stays the exercise: the word being learned is
  // blanked out and the learner writes it back. Without a usable sentence the
  // word itself is asked from its meaning.
  const blanked = (() => {
    if (!sentence?.text) return null;
    const escaped = word.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}])(${escaped})([^\\p{L}]|$)`, "iu");
    if (!re.test(sentence.text)) return null;
    return sentence.text.replace(re, (_m, before: string, _hit: string, after: string) =>
      `${before}____${after}`,
    );
  })();

  const answer = blanked ? word.text : (sentence?.text ?? word.text);
  const task = blanked ?? sentence?.text ?? null;
  const support = sentence?.translation ?? word.translation ?? word.meaning ?? "";
  const [value, setValue] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [retry, setRetry] = useState(false);
  const [tries, setTries] = useState(0);
  const [feedback, setFeedback] = useState<{ missing: string[]; extra: string[] }>({
    missing: [],
    extra: [],
  });

  const check = () => {
    const clean = value.trim().replace(/\s+/g, " ");
    const expected = normalize(answer).split(" ").filter(Boolean);
    const given = normalize(clean).split(" ").filter(Boolean);
    const pool = [...given];
    const missing: string[] = [];
    for (const token of expected) {
      const at = pool.indexOf(token);
      if (at >= 0) pool.splice(at, 1);
      else missing.push(token);
    }
    // Content, order and spelling all count towards the score.
    const content = expected.length === 0 ? 0 : (expected.length - missing.length) / expected.length;
    const order = similarity(normalize(clean), normalize(answer));
    const result =
      normalize(clean) === normalize(answer)
        ? 1
        : Math.round(Math.max(0, content * 0.6 + order * 0.4 - pool.length * 0.05) * 100) / 100;
    const attemptCount = tries + 1;
    setTries(attemptCount);
    setFeedback({ missing, extra: pool });
    // One honest retry before the answer is revealed; a retry never inflates
    // the stored mastery.
    if (result < 0.9 && attemptCount === 1) {
      setRetry(true);
      return;
    }
    setRetry(false);
    setScore(attemptCount > 1 && result >= 0.9 ? Math.min(result, 0.7) : result);
  };

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-lg font-bold">{t("practice.writingTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {sentence ? t("train.writeSentenceHint") : t("train.writeHint")}
      </p>

      <div className="card-surface animate-rise mt-4 p-6">
        {/* The writing task, always in the target language. */}
        <p className="text-lg leading-relaxed font-semibold" lang={locale} dir="auto">
          {task ?? (word.translation ?? word.meaning ?? word.text)}
        </p>

        {/* The translation stays visible; tapping a word shows its target-language match. */}
        {support && task && sentence?.translation ? (
          <div className="mt-4 border-t border-border pt-3">
            <TappableSentence
              text={sentence.translation}
              sentence={sentence}
              locale={locale}
            />
          </div>
        ) : support && task ? (
          <p className="mt-4 border-t border-border pt-3 text-base leading-relaxed font-medium text-muted-foreground" dir="auto">
            {support}
          </p>
        ) : null}
      </div>

      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("practice.writingPlaceholder")}
        aria-label={t("practice.writingPlaceholder")}
        lang={locale}
        disabled={score !== null}
        className="mt-4 h-12 rounded-2xl"
        onKeyDown={(event) => {
          if (event.key === "Enter" && score === null && value.trim()) check();
        }}
      />

      {retry ? (
        <div className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm font-semibold text-secondary-foreground" role="status">
          <p>{t("train.tryAgain")}</p>
          {feedback.missing.length > 0 ? (
            <p className="mt-1 text-xs">
              {t("train.writeMissing")}: {feedback.missing.length}
            </p>
          ) : null}
          {feedback.extra.length > 0 ? (
            <p className="mt-1 text-xs">
              {t("train.writeExtra")}: {feedback.extra.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {score !== null ? (
        <div
          className={cn(
            "mt-4 rounded-2xl px-4 py-3 text-sm font-semibold",
            score >= 0.9 ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive",
          )}
          role="status"
        >
          {score >= 0.9 ? t("practice.correct") : t("practice.wrong")}{" "}
          {score >= 0.9 ? null : (
            <span className="font-bold" lang={locale}>
              {answer}
            </span>
          )}
        </div>
      ) : null}



      {score === null ? (
        <Button
          size="lg"
          className="mt-auto w-full rounded-2xl"
          disabled={!value.trim()}
          onClick={check}
        >
          <Check className="size-4" /> {t("common.check")}
        </Button>
      ) : (
        <Button
          size="lg"
          className="mt-auto w-full rounded-2xl"
          onClick={() => onDone(score, value)}
        >
          {t("common.next")} <ArrowRight className="size-4 rtl:rotate-180" />
        </Button>
      )}
    </div>
  );
}

/* -------------------------------- meaning --------------------------------- */

function MeaningStep({
  unit,
  units,
  locale,
  onDone,
}: {
  unit: WordUnit;
  units: WordUnit[];
  locale: string;
  onDone: (correct: boolean, response: string) => void;
}) {
  const { t } = useI18n();
  const correct = unit.word.translation ?? unit.word.meaning ?? "";
  const [picked, setPicked] = useState<string | null>(null);

  const options = useMemo(() => {
    const distractors = units
      .filter((other) => other.word.id !== unit.word.id)
      .map((other) => other.word.translation ?? other.word.meaning ?? "")
      .filter((value) => value && value !== correct);
    const unique = [...new Set(distractors)].slice(0, 3);
    const all = [correct, ...unique];
    // Stable shuffle per word so re-renders keep the same order.
    const seed = unit.word.id.charCodeAt(0) + unit.word.id.length;
    return all
      .map((value, i) => ({ value, key: (i * 7 + seed) % all.length }))
      .sort((a, b) => a.key - b.key)
      .map((entry) => entry.value);
  }, [correct, unit.word.id, units]);

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="text-lg font-bold">{t("train.meaningTitle")}</h2>
      <div className="card-surface animate-rise mt-4 p-6 text-center">
        <p className="text-3xl font-bold" lang={locale}>
          {unit.word.text}
        </p>
        <SpeakButton variant="secondary" className="mt-4 w-full rounded-xl" text={unit.word.text} locale={locale} label={t("train.wordAudio")} />
      </div>

      <ul className="mt-4 space-y-2.5">
        {options.map((option) => {
          const isCorrect = option === correct;
          const chosen = picked === option;
          return (
            <li key={option}>
              <button
                type="button"
                disabled={picked !== null}
                onClick={() => setPicked(option)}
                className={cn(
                  "card-surface w-full p-4 text-start text-sm font-semibold transition",
                  picked !== null && isCorrect && "bg-success-soft text-success",
                  chosen && !isCorrect && "bg-destructive/10 text-destructive",
                )}
              >
                {option}
              </button>
            </li>
          );
        })}
      </ul>

      {picked !== null ? (
        <Button
          size="lg"
          className="mt-auto w-full rounded-2xl"
          onClick={() => onDone(picked === correct, picked)}
        >
          {t("common.next")} <ArrowRight className="size-4 rtl:rotate-180" />
        </Button>
      ) : (
        <p className="mt-auto pt-6 text-center text-sm text-muted-foreground">
          {t("train.meaningHint")}
        </p>
      )}
    </div>
  );
}

/* ------------------------------- playback icon ----------------------------- */

export const PlayIcon = Play;
