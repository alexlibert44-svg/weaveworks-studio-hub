import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Play, Volume2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { MasteryBar, StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { speechLocale } from "@/lib/i18n/languages";
import { getWord } from "@/lib/verba/api";
import { posLabel } from "@/lib/verba/pos";
import {
  UNIT_SKILLS,
  skillMastery,
  unitProgress,
  wordSkillItems,
  wordStatus,
} from "@/lib/verba/progress";
import { speak } from "@/lib/verba/speech";
import type { MessageKey } from "@/lib/i18n";
import type { Skill } from "@/lib/verba/types";

const SKILL_LABEL: Partial<Record<Skill, MessageKey>> = {
  writing: "word.skillWriting",
  speaking: "word.skillPronunciation",
  recall: "word.skillMeaning",
};

export const Route = createFileRoute("/sets/$setId/words/$wordId")({
  head: () => ({
    meta: [
      { title: "Word Detail — LingoFlow" },
      {
        name: "description",
        content:
          "Meaning, pronunciation, example sentences and your skill breakdown for this word.",
      },
      { property: "og:title", content: "Word Detail — LingoFlow" },
      {
        property: "og:description",
        content: "How well you know this word across writing, pronunciation and meaning.",
      },
    ],
  }),
  component: WordDetail,
});

function WordDetail() {
  const { setId, wordId } = Route.useParams();
  const { t } = useI18n();

  const { data } = useQuery({ queryKey: ["word", wordId], queryFn: () => getWord(wordId) });

  if (!data) {
    return (
      <AppShell>
        <Skeleton className="h-40 rounded-2xl" />
      </AppShell>
    );
  }

  const { word, sentences, items, set, attempts } = data;
  const locale = speechLocale(set.target_language);
  const example = sentences.find((s) => s.form === "base") ?? sentences[0];
  const skillItems = wordSkillItems(items, word.id);
  const mastery = unitProgress(skillItems, UNIT_SKILLS);
  const status = wordStatus(attempts);
  const history = attempts.slice(0, 12);

  return (
    <AppShell>
      <Button asChild variant="ghost" size="icon" aria-label={t("word.backToSet")}>
        <Link to="/sets/$setId" params={{ setId }} search={{}}>
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </Link>
      </Button>

      <div className="card-surface animate-rise mt-2 p-6 text-center">
        <p className="text-3xl font-bold" lang={set.target_language}>
          {word.text}
        </p>
        {word.pronunciation ? (
          <p className="mt-1 text-sm text-muted-foreground">{word.pronunciation}</p>
        ) : null}
        {word.part_of_speech ? (
          <p className="mt-2 text-xs font-semibold tracking-wide text-primary uppercase">
            {posLabel(t as never, word.part_of_speech)}
            {word.alternative_parts_of_speech?.length
              ? ` · ${word.alternative_parts_of_speech
                  .map((alt) => posLabel(t as never, alt))
                  .join(", ")}`
              : ""}
          </p>
        ) : null}
        <Button
          variant="secondary"
          className="mt-4 rounded-xl"
          onClick={() => speak(word.text, locale)}
        >
          <Volume2 className="size-4" /> {t("common.listen")}
        </Button>
      </div>

      <div className="card-surface mt-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{t("word.overall")}</span>
          <div className="flex items-center gap-2">
            <StatePill state={status} />
            <span className="text-sm font-bold text-primary">{mastery}%</span>
          </div>
        </div>
        <MasteryBar value={mastery} className="mt-3" />
        <ul className="mt-4 space-y-3">
          {UNIT_SKILLS.map((skill) => {
            const item = skillItems.find((i) => i.skill === skill);
            const value = Math.round(Number(item?.mastery ?? 0));
            const m = skillMastery(skill, attempts);
            return (
              <li key={skill}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {t(SKILL_LABEL[skill] as MessageKey)}
                    {m.mastered ? (
                      <Check className="size-3.5 text-success" aria-label={t("word.skillMastered")} />
                    ) : null}
                  </span>
                  <span className="text-sm font-bold text-primary">
                    {m.attempts === 0 ? t("word.notStarted") : `${value}%`}
                  </span>
                </div>
                <MasteryBar value={m.attempts === 0 ? 0 : value} className="mt-1.5 h-1.5" />
                {m.attempts > 0 ? (
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    {t("word.successes", {
                      successes: m.successes,
                      attempts: m.attempts,
                      sessions: m.sessions,
                    })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[0.7rem] text-muted-foreground">{t("word.masteryRule")}</p>
      </div>

      <Button asChild size="lg" className="mt-4 w-full rounded-2xl">
        <Link to="/practice" search={{ set: setId, word: wordId }}>
          <Play className="size-4" /> {t(status === "new" ? "word.train" : "word.review")}
        </Link>
      </Button>

      <div className="card-surface mt-4 p-5">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {t("word.translation")}
        </p>
        <p className="mt-1 text-base font-semibold">{word.translation ?? word.meaning}</p>
      </div>

      {example ? (
        <div className="card-surface mt-3 p-5">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("word.example")}
          </p>
          <p className="mt-1.5 text-base font-semibold" lang={set.target_language}>
            {example.text}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{example.translation}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 rounded-xl px-2"
            onClick={() => speak(example.text, locale)}
          >
            <Volume2 className="size-4" /> {t("common.listen")}
          </Button>
        </div>
      ) : null}


      <h2 className="mt-7 mb-3 text-lg font-bold">{t("word.history")}</h2>
      {history.length === 0 ? (
        <p className="card-surface p-4 text-sm text-muted-foreground">{t("word.historyEmpty")}</p>
      ) : (
        <ul className="card-surface divide-y divide-border px-4">
          {history.map((a, index) => (
            <li key={`${a.created_at}-${index}`} className="flex items-center gap-3 py-2.5 text-sm">
              {a.is_correct ? (
                <Check className="size-4 shrink-0 text-success" aria-label={t("word.correct")} />
              ) : (
                <X className="size-4 shrink-0 text-destructive" aria-label={t("word.incorrect")} />
              )}
              <span className="flex-1 font-semibold">{t(SKILL_LABEL[a.skill] as MessageKey)}</span>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {new Date(a.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
