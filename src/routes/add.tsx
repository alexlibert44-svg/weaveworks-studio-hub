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

const MIN_WORDS = 4;

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

  // The typed-but-not-yet-added word still counts: otherwise the button looks
  // disabled after the learner types their fourth word.
  const pending = draft.trim();
  const allWords =
    pending && !words.some((w) => w.toLowerCase() === pending.toLowerCase())
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
      void navigate({ to: "/sets/$setId", params: { setId } });
    },
  });

  const addWord = () => {
    const value = draft.trim();
    if (!value) return;
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
        <span className="bg-hero-gradient flex size-20 items-center justify-center rounded-3xl text-primary-foreground shadow-glow">
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
          lang={learner.learning_language}
          className="h-12 rounded-2xl"
        />
        <Button
          onClick={addWord}
          aria-label={t("add.addWord")}
          className="size-12 shrink-0 rounded-2xl"
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("add.count", { count: allWords.length, min: MIN_WORDS })}
      </p>
      {notice ? <p className="mt-1 text-xs font-semibold text-destructive">{notice}</p> : null}

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
        disabled={allWords.length < MIN_WORDS || create.isPending}
        onClick={() => {
          if (create.isPending) return;
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
