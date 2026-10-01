import { Clock, Loader2, RotateCcw, Star, Target } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { formatDuration, type TrainingResult } from "@/lib/verba/training";

/** Results of one completed training session: exactly three statistics. */
export function TrainingResults({
  result,
  error,
  onRetrySave,
  onFinish,
  onTrainAgain,
  note,
}: {
  result: TrainingResult | null;
  error: string | null;
  onRetrySave: () => void;
  onFinish: () => void;
  onTrainAgain: () => void;
  note?: ReactNode;
}) {
  const { t } = useI18n();

  if (!result) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        {error ? (
          <>
            <p className="text-sm text-destructive" role="alert">{t("results.saveFailed")}</p>
            <Button size="lg" className="mt-6 w-full rounded-2xl" onClick={onRetrySave}>
              {t("results.retry")}
            </Button>
          </>
        ) : (
          <>
            <Loader2 className="size-7 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">{t("results.saving")}</p>
          </>
        )}
      </div>
    );
  }

  const accuracy = result.accuracy == null ? "—" : `${Math.round(result.accuracy)}%`;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <h1 className="text-center text-2xl font-bold">{t("results.title")}</h1>
      <div className="mt-8 grid grid-cols-3 gap-2.5">
        <Stat icon={<Clock className="size-5" />} label={t("results.time")} value={formatDuration(result.duration_seconds)} />
        <Stat icon={<Target className="size-5" />} label={t("results.accuracy")} value={accuracy} />
        <Stat icon={<Star className="size-5" />} label={t("results.points")} value={`+${result.points}`} />
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {result.total > 0
          ? t("results.answers", { correct: result.correct, total: result.total })
          : t("results.noAnswers")}
      </p>
      {note ? <div className="mt-2 text-center text-xs text-muted-foreground">{note}</div> : null}
      <div className="mt-8 space-y-2.5">
        <Button size="lg" className="w-full rounded-2xl" onClick={onFinish}>
          {t("results.finish")}
        </Button>
        <Button size="lg" variant="secondary" className="w-full rounded-2xl" onClick={onTrainAgain}>
          <RotateCcw className="size-4" /> {t("results.again")}
        </Button>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="card-surface flex min-w-0 flex-col items-center p-4 text-center">
      <span className="text-primary">{icon}</span>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
