import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Play, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppShell } from "@/components/verba/AppShell";
import { MasteryBar, StatePill } from "@/components/verba/MasteryPill";
import { useI18n } from "@/lib/i18n";
import { speechLocale } from "@/lib/i18n/languages";
import { getForm } from "@/lib/verba/api";
import { FORM_SKILLS, unitProgress, unitState } from "@/lib/verba/progress";
import { speak } from "@/lib/verba/speech";
import { SKILL_KEY } from "@/lib/verba/types";

export const Route = createFileRoute("/sets/$setId/forms/$formId")({
  head: () => ({
    meta: [
      { title: "Form Detail — LingoFlow" },
      { name: "description", content: "How this form is built, an example, and your skill progress." },
      { property: "og:title", content: "Form Detail — LingoFlow" },
      { property: "og:description", content: "Learn and train one tense or form at a time." },
    ],
  }),
  component: FormDetail,
});

function FormDetail() {
  const { setId, formId } = Route.useParams();
  const { t } = useI18n();
  const { data } = useQuery({ queryKey: ["form", formId], queryFn: () => getForm(formId) });

  if (!data) {
    return (
      <AppShell>
        <Skeleton className="h-40 rounded-2xl" />
      </AppShell>
    );
  }

  const { form, word, set, items } = data;
  const locale = speechLocale(set.target_language);
  const progress = unitProgress(items, FORM_SKILLS);

  return (
    <AppShell>
      <Button asChild variant="ghost" size="icon" aria-label={t("word.backToSet")}>
        <Link to="/sets/$setId" params={{ setId }} search={{ tab: "forms" }}>
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </Link>
      </Button>

      <div className="card-surface animate-rise mt-2 p-6 text-center">
        <p className="text-3xl font-bold" lang={set.target_language}>
          {form.text}
        </p>
        {form.pronunciation ? (
          <p className="mt-1 text-sm text-muted-foreground">{form.pronunciation}</p>
        ) : null}
        <p className="mt-2 text-xs font-semibold tracking-wide text-primary uppercase">
          {t("form.of", { label: form.form_label, word: word.text })}
        </p>
        {form.is_regular !== null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t(form.is_regular ? "form.regular" : "form.irregular")}
          </p>
        ) : null}
        <Button variant="secondary" className="mt-4 rounded-xl" onClick={() => speak(form.text, locale)}>
          <Volume2 className="size-4" /> {t("common.listen")}
        </Button>
      </div>

      <div className="card-surface mt-4 p-5">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
          {t("word.translation")}
        </p>
        <p className="mt-1 text-base font-semibold">{form.translation}</p>
      </div>

      {form.explanation ? (
        <div className="card-surface mt-3 p-5">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("form.why")}
          </p>
          <p className="mt-1 text-sm">{form.explanation}</p>
        </div>
      ) : null}

      {form.example ? (
        <div className="card-surface mt-3 p-5">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("word.example")}
          </p>
          <p className="mt-1.5 text-base font-semibold" lang={set.target_language}>
            {form.example}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{form.example_translation}</p>
          <Button variant="ghost" size="sm" className="mt-2 rounded-xl px-2" onClick={() => speak(form.example ?? "", locale)}>
            <Volume2 className="size-4" /> {t("common.listen")}
          </Button>
        </div>
      ) : null}

      <div className="card-surface mt-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{t("word.mastery")}</span>
          <div className="flex items-center gap-2">
            <StatePill state={unitState(items, FORM_SKILLS)} />
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
        </div>
        <MasteryBar value={progress} className="mt-3" />
      </div>

      <h2 className="mt-7 mb-3 text-lg font-bold">{t("word.skills")}</h2>
      <ul className="space-y-2.5">
        {FORM_SKILLS.map((skill) => {
          const item = items.find((i) => i.skill === skill);
          const value = Math.round(Number(item?.mastery ?? 0));
          return (
            <li key={skill} className="card-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t(SKILL_KEY[skill])}</span>
                <span className="text-sm font-bold text-primary">{value}%</span>
              </div>
              <MasteryBar value={value} className="mt-2 h-1.5" />
            </li>
          );
        })}
      </ul>

      <Button asChild size="lg" className="mt-6 w-full rounded-2xl">
        <Link to="/practice" search={{ set: setId, form: formId }}>
          <Play className="size-4" /> {t("form.train")}
        </Link>
      </Button>
    </AppShell>
  );
}
