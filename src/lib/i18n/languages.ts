/**
 * Language catalogue. `ui` marks languages the interface itself is translated
 * into — any other native language falls back to English chrome while all
 * generated content still uses the learner's real language pair.
 */
export interface LanguageMeta {
  code: string;
  /** Name in the language itself, always shown to the learner. */
  native: string;
  /** English name, used for search and for AI prompts. */
  english: string;
  /** ISO 3166-1 alpha-2 country associated with the language option and flag. */
  countryCode: string;
  bcp47: string;
  rtl?: boolean;
  ui?: boolean;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "ar", native: "العربية", english: "Arabic", countryCode: "SA", bcp47: "ar-SA", rtl: true, ui: true },
  { code: "en", native: "English", english: "English", countryCode: "GB", bcp47: "en-US", ui: true },
  { code: "fr", native: "Français", english: "French", countryCode: "FR", bcp47: "fr-FR", ui: true },
  { code: "es", native: "Español", english: "Spanish", countryCode: "ES", bcp47: "es-ES", ui: true },
  { code: "de", native: "Deutsch", english: "German", countryCode: "DE", bcp47: "de-DE" },
  { code: "it", native: "Italiano", english: "Italian", countryCode: "IT", bcp47: "it-IT" },
  { code: "pt", native: "Português", english: "Portuguese", countryCode: "PT", bcp47: "pt-PT" },
  { code: "nl", native: "Nederlands", english: "Dutch", countryCode: "NL", bcp47: "nl-NL" },
  { code: "tr", native: "Türkçe", english: "Turkish", countryCode: "TR", bcp47: "tr-TR" },
  { code: "ru", native: "Русский", english: "Russian", countryCode: "RU", bcp47: "ru-RU" },
  { code: "uk", native: "Українська", english: "Ukrainian", countryCode: "UA", bcp47: "uk-UA" },
  { code: "pl", native: "Polski", english: "Polish", countryCode: "PL", bcp47: "pl-PL" },
  { code: "sv", native: "Svenska", english: "Swedish", countryCode: "SE", bcp47: "sv-SE" },
  { code: "el", native: "Ελληνικά", english: "Greek", countryCode: "GR", bcp47: "el-GR" },
  { code: "he", native: "עברית", english: "Hebrew", countryCode: "IL", bcp47: "he-IL", rtl: true },
  { code: "fa", native: "فارسی", english: "Persian", countryCode: "IR", bcp47: "fa-IR", rtl: true },
  { code: "ur", native: "اردو", english: "Urdu", countryCode: "PK", bcp47: "ur-PK", rtl: true },
  { code: "hi", native: "हिन्दी", english: "Hindi", countryCode: "IN", bcp47: "hi-IN" },
  { code: "id", native: "Bahasa Indonesia", english: "Indonesian", countryCode: "ID", bcp47: "id-ID" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese", countryCode: "VN", bcp47: "vi-VN" },
  { code: "th", native: "ไทย", english: "Thai", countryCode: "TH", bcp47: "th-TH" },
  { code: "ja", native: "日本語", english: "Japanese", countryCode: "JP", bcp47: "ja-JP" },
  { code: "ko", native: "한국어", english: "Korean", countryCode: "KR", bcp47: "ko-KR" },
  { code: "zh", native: "中文", english: "Chinese", countryCode: "CN", bcp47: "zh-CN" },
];

/**
 * Languages that can be learned (target language). Tenseless languages
 * (Indonesian, Vietnamese, Thai, Chinese) are excluded because the AI
 * tense-conjugation feature does not apply to them. They remain available
 * as native languages via LANGUAGES.
 */
export const TARGET_LANGUAGES: LanguageMeta[] = LANGUAGES.filter(
  (l) => !["id", "vi", "th", "zh"].includes(l.code),
);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function language(code: string | null | undefined): LanguageMeta {
  return BY_CODE.get(code ?? "en") ?? BY_CODE.get("en")!;
}

export function localizedLanguageName(code: string, locale: string): string {
  const item = language(code);
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(item.code) ?? item.english;
  } catch {
    return item.english;
  }
}

export function localizedCountryName(code: string, locale: string): string {
  const item = language(code);
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(item.countryCode) ?? item.countryCode;
  } catch {
    return item.countryCode;
  }
}

export function isRtl(code: string | null | undefined): boolean {
  return Boolean(language(code).rtl);
}

/** BCP-47 tag used for speech synthesis / recognition of the target language. */
export function speechLocale(code: string | null | undefined): string {
  return language(code).bcp47;
}
