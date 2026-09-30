import { supabase } from "@/integrations/supabase/client";

/**
 * Real audio playback. Words and sentences are synthesized once by the
 * app's speech service (natural voices, all app languages incl. Arabic),
 * cached for the session, and played through an <audio> element. The promise
 * rejects when synthesis or playback fails, so callers never claim success.
 */

const cache = new Map<string, Promise<string>>();
let current: HTMLAudioElement | null = null;

function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(locale.split("-")[0] ?? locale) ?? locale;
  } catch {
    return locale;
  }
}

async function synthesize(text: string, locale: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("signed-out");
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ text, language: languageName(locale) }),
  });
  if (!response.ok) throw new Error(`audio-${response.status}`);
  const blob = await response.blob();
  if (blob.size < 100) throw new Error("audio-empty");
  return URL.createObjectURL(blob);
}

/** Loads (or reuses) the audio for this text. */
export function loadSpeech(text: string, locale = "en-US"): Promise<string> {
  const key = `${locale}|${text}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = synthesize(text, locale);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

/** Plays the text; resolves when playback ends, rejects on any failure. */
export async function playSpeech(text: string, locale = "en-US"): Promise<void> {
  if (typeof window === "undefined" || !text.trim()) return;
  const url = await loadSpeech(text, locale);
  current?.pause();
  const audio = new Audio(url);
  current = audio;
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("playback-failed"));
    audio.play().catch(reject);
  });
}

/** Fire-and-forget playback (e.g. autoplay on a new word). */
export function speak(text: string, locale = "en-US") {
  void playSpeech(text, locale).catch(() => undefined);
}

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]);
}

type RecognitionHandle = { stop: () => void };

export function listenOnce(
  onResult: (transcript: string) => void,
  onError: (message: string) => void,
  locale = "en-US",
): RecognitionHandle | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
    | (new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        start: () => void;
        stop: () => void;
        onresult: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
      })
    | undefined;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = locale;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event: unknown) => {
    const results = (event as { results: { 0: { 0: { transcript: string } } } }).results;
    onResult(results[0][0].transcript);
  };
  recognition.onerror = () => onError("recognition-failed");
  recognition.start();
  return { stop: () => recognition.stop() };
}
