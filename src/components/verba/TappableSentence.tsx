import { useEffect, useMemo, useRef, useState } from "react";

import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Sentence } from "@/lib/verba/types";

const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "");

type WordGloss = { i: number; word: string; meaning: string | null };

/** Builds the per-word mapping from the alignment saved when the sentence was generated. */
function hintGlosses(text: string, hints: unknown): WordGloss[] | null {
  if (!Array.isArray(hints) || hints.length === 0) return null;
  const pairs = hints
    .filter((h): h is { native: string; target: string } => typeof h?.native === "string" && typeof h?.target === "string")
    .map((h) => ({ words: h.native.split(/\s+/).map(clean).filter(Boolean), target: h.target }));
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      const w = clean(word);
      const hit = pairs.find((p) => p.words.includes(w));
      return { i, word, meaning: hit?.target ?? null };
    });
}

/**
 * The learner's-language translation with every word tappable. A tap shows the
 * matching target-language word(s) in context, in a small bubble. A match that
 * would give away the writing answer is withheld; nothing else is revealed.
 */
export function TappableSentence({
  text,
  sentence,
  locale,
  hidden,
}: {
  text: string;
  sentence: Sentence;
  /** Target-language speech locale. */
  locale: string;
  /** The writing answer: never shown. */
  hidden?: string | null;
}) {
  const { t, native } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  // Stored data only: saved alignment first, otherwise the generation-time word hints. No AI on tap.
  const glosses = useMemo<WordGloss[] | null>(() => {
    const saved = (sentence as Sentence & { word_glosses?: unknown }).word_glosses as
      | { v?: number; words?: (Omit<WordGloss, "i"> & { i?: number })[] }
      | null
      | undefined;
    if (saved && Array.isArray(saved.words) && (saved.v === 3 || saved.v === 2)) {
      return saved.words.map((w, i) => ({ i: w.i ?? i, word: w.word, meaning: w.meaning }));
    }
    return hintGlosses(text, (sentence as Sentence & { word_hints?: unknown }).word_hints);
  }, [sentence, text]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const tokens = text.split(/(\s+)/);

  /** Index among whitespace-separated words — the same key the saved alignment uses. */
  const wordIndex = (tokenIndex: number) => tokens.slice(0, tokenIndex).filter((x) => x.trim()).length;

  const glossFor = (list: WordGloss[] | null, tokenIndex: number): WordGloss | null => {
    if (!list) return null;
    const word = clean(tokens[tokenIndex] ?? "");
    const byIndex = list.find((g) => g.i === wordIndex(tokenIndex));
    if (byIndex && clean(byIndex.word) === word) return byIndex;
    // Displayed text can differ slightly from the saved translation: fall back to the same word.
    return list.find((g) => clean(g.word) === word && g.meaning) ?? list.find((g) => clean(g.word) === word) ?? null;
  };

  const meaningFor = (tokenIndex: number): string | null => glossFor(glosses, tokenIndex)?.meaning ?? null;

  return (
    <div ref={ref}>
      <p className="text-base leading-loose font-medium text-muted-foreground" lang={native.code} dir="auto">
        {tokens.map((token, index) => {
          if (!token.trim() || token.includes("____") || !clean(token)) {
            return <span key={index}>{token}</span>;
          }
          const active = open === index;
          return (
            <span key={index} className="relative inline-block">
              <button
                type="button"
                onClick={() => {
                  setOpen(active ? null : index);
                }}
                aria-expanded={active}
                className={cn(
                  "rounded-lg px-0.5 underline decoration-primary/30 decoration-dotted underline-offset-4 transition",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-primary-soft",
                )}
              >
                {token}
              </button>
              {active ? (
                <span
                  role="status"
                  className="absolute start-0 top-full z-20 mt-1 w-max max-w-[14rem] rounded-xl border border-border bg-popover px-3 py-1.5 text-sm font-semibold whitespace-normal text-primary-deep shadow-card"
                >
                  {(() => {
                      const match = meaningFor(index);
                      if (!match) return t("train.noMeaning");
                      if (hidden && clean(match).includes(clean(hidden))) return t("train.answerHidden");
                      return <span lang={locale.split("-")[0]} dir="auto">{match}</span>;
                    })()}
                </span>
              ) : null}
            </span>
          );
        })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("train.tapForHint")}</p>
    </div>
  );
}
