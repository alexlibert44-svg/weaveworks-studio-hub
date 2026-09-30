import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { LANGUAGES, isRtl, language, speechLocale, type LanguageMeta } from "./languages";
import { ar } from "./dictionaries/ar";
import { en, type Dictionary, type MessageKey } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";

const DICTIONARIES: Record<string, Dictionary> = { en, ar, fr, es };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface I18nValue {
  /** UI locale — the learner's native language when translated, else English. */
  locale: string;
  dir: "ltr" | "rtl";
  t: Translate;
  /** Learner's own language. */
  native: LanguageMeta;
  /** The language being learned. */
  target: LanguageMeta;
  /** BCP-47 tag for speech in the target language. */
  targetSpeech: string;
  languages: LanguageMeta[];
  languageName: (code: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function I18nProvider({
  nativeCode,
  targetCode,
  children,
}: {
  nativeCode: string;
  targetCode: string;
  children: ReactNode;
}) {
  const value = useMemo<I18nValue>(() => {
    const native = language(nativeCode);
    const target = language(targetCode);
    const locale = DICTIONARIES[native.code] ? native.code : "en";
    const dict = DICTIONARIES[locale] ?? en;
    return {
      locale,
      dir: isRtl(locale) ? "rtl" : "ltr",
      t: (key, vars) => interpolate(dict[key] ?? en[key] ?? key, vars),
      native,
      target,
      targetSpeech: speechLocale(target.code),
      languages: LANGUAGES,
      languageName: (code: string) => language(code).native,
    };
  }, [nativeCode, targetCode]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = value.locale;
    root.dir = value.dir;
  }, [value.locale, value.dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export type { MessageKey };
