import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell, PageTitle } from "@/components/verba/AppShell";
import { useLearner } from "@/components/verba/AppGate";
import { useI18n } from "@/lib/i18n";
import { createSet } from "@/lib/verba/api";
import { usePlan } from "@/lib/verba/plan";
import { PremiumGate } from "@/components/verba/Premium";

const MIN_WORDS = 4;
const MAX_WORDS = 10;

export const Route = createFileRoute("/add")({
  head: () => ({
    meta: [
      { title: "New Word Set — LingoFlow" },
      {
        name: "description",
        content:
          "Add at least four words and LingoFlow writes natural sentences, translations and exercises for them.",
      },
      { property: "og:title", content: "New Word Set — LingoFlow" },
      {
        property: "og:description",
        content: "Your words become sentences, listening, writing, speaking and recall practice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddPage,
});

function AddPage() {
  const { deviceId, learner } = useLearner();
  const { t, native, target } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [words, setWords] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const { remaining } = usePlan(deviceId);
  const limitReached = remaining === 0;

  // The typed-but-not-yet-added word still counts: otherwise the button looks
  // disabled after the learner types their fourth word.
  const pending = draft.trim();
  const allWords =
    pending && words.length < MAX_WORDS && !words.some((w) => w.toLowerCase() === pending.toLowerCase())
      ? [...words, pending]
      : words;

  const create = useMutation({
    mutationFn: () =>
      createSet({
        deviceId,
        name: name.trim() || target.native,
        words: allWords,
        targetLanguage: learner.learning_language,
        nativeLanguage: learner.native_language,
        targetLanguageName: target.english,
        nativeLanguageName: native.english,
      }),
    onSuccess: async (setId) => {
      await queryClient.invalidateQueries({ queryKey: ["sets", deviceId] });
      await queryClient.invalidateQueries({ queryKey: ["due", deviceId] });
      await queryClient.invalidateQueries({ queryKey: ["sets-today", deviceId] });
      void navigate({ to: "/sets/$setId", params: { setId } });
    },
  });

  const addWord = () => {
    const value = draft.trim();
    if (!value) return;
    if (words.length >= MAX_WORDS) {
      setNotice(t("add.max", { max: MAX_WORDS }));
      return;
    }
    if (words.some((w) => w.toLowerCase() === value.toLowerCase())) {
      setNotice(t("add.duplicate"));
      return;
    }
    setWords((list) => [...list, value]);
    setDraft("");
    setNotice(null);
  };

  if (create.isPending) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <span className="flex size-20 items-center justify-center rounded-lg bg-primary-soft text-primary shadow-card">
          <Sparkles className="size-9" />
        </span>
        <h1 className="mt-6 text-xl font-bold">{t("add.generating")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("add.generatingBody")}</p>
        <Loader2 className="mt-6 size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AppShell>
      <PageTitle title={t("add.title")} subtitle={t("add.subtitle")} />
      {remaining !== null && !limitReached ? (
        <p className="-mt-3 mb-4 text-xs font-semibold text-primary-deep" role="status">{t("premium.remaining", { count: remaining })}</p>
      ) : null}
      {limitReached ? <PremiumGate className="mb-5" title={t("premium.limitReached")} body={t("premium.limitBody")} /> : null}

      <label className="block text-sm font-semibold" htmlFor="set-name">
        {t("add.nameLabel")}
      </label>
      <Input
        id="set-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("add.namePlaceholder")}
        className="mt-2 h-12 rounded-2xl"
      />

      <label className="mt-5 block text-sm font-semibold" htmlFor="set-word">
        {t("add.wordsLabel")}
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id="set-word"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addWord();
            }
          }}
          placeholder={t("add.wordPlaceholder")}
          disabled={words.length >= MAX_WORDS}
          lang={learner.learning_language}
          className="h-12 rounded-2xl"
        />
        <Button
          onClick={addWord}
          disabled={words.length >= MAX_WORDS}
          aria-label={t("add.addWord")}
          className="size-12 shrink-0 rounded-2xl"
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("add.count", { count: allWords.length, min: MIN_WORDS })}
      </p>
      {words.length >= MAX_WORDS ? (
        <p className="mt-1 text-xs font-semibold text-primary-deep" role="status">{t("add.max", { max: MAX_WORDS })}</p>
      ) : null}
      {notice && words.length < MAX_WORDS ? <p className="mt-1 text-xs font-semibold text-destructive">{notice}</p> : null}

      <ul className="mt-4 flex flex-wrap gap-2">
        {words.map((word) => (
          <li key={word}>
            <button
              type="button"
              onClick={() => setWords((list) => list.filter((w) => w !== word))}
              aria-label={t("add.remove", { word })}
              className="flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-deep"
            >
              <span lang={learner.learning_language}>{word}</span>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {create.isError ? (
        <p className="mt-4 text-sm font-semibold text-destructive" role="alert">
          {create.error instanceof Error && create.error.message
            ? create.error.message
            : t("add.failed")}
        </p>
      ) : null}

      <Button
        size="lg"
        className="mt-6 w-full rounded-2xl"
        disabled={limitReached || allWords.length < MIN_WORDS || allWords.length > MAX_WORDS || create.isPending}
        onClick={() => {
          if (create.isPending || limitReached) return;
          if (pending) {
            setWords(allWords);
            setDraft("");
          }
          create.mutate();
        }}
      >
        <Sparkles className="size-4" /> {t("add.create")}
      </Button>
      {allWords.length < MIN_WORDS ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {t("add.needMore", { min: MIN_WORDS })}
        </p>
      ) : null}
    </AppShell>
  );
}
