/**
 * Persistent speech audio. Each (voice, language, text) is synthesized once
 * with the existing TTS model, stored in the private `speech-audio` bucket and
 * recorded in `audio_assets`. Later requests are served from storage and never
 * call the TTS model again.
 */
export const VOICE = "Kore";
const BUCKET = "speech-audio";

async function sha256(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const audioKey = (text: string, language: string) =>
  sha256(`${VOICE}|${language.trim().toLowerCase()}|${text.trim()}`);

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function synthesize(text: string, language: string): Promise<{ bytes: ArrayBuffer; type: string }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Audio is not configured");
  const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.1-flash-tts-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              // Only the quoted text is spoken: no translation, no added words.
              text: `Speak the text between <say> tags in ${language}, with native ${language} pronunciation, clearly and at a slightly slow teaching pace. Say exactly that text, word for word: do not translate it, do not read the tags, and do not add anything.\n<say>${text}</say>`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
      stream_format: "audio",
    }),
  });
  if (!upstream.ok) {
    const err = new Error(`tts-${upstream.status}`) as Error & { status?: number };
    err.status = upstream.status;
    throw err;
  }
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength < 100) throw new Error("tts-empty");
  return { bytes, type: upstream.headers.get("content-type") ?? "audio/wav" };
}

/** Returns the stored path, generating + storing only when no ready copy exists. */
export async function ensureAudio(text: string, language: string): Promise<{ path: string; generated: boolean }> {
  const db = await admin();
  const cacheKey = await audioKey(text, language);
  const { data: row } = await db.from("audio_assets").select("status, storage_path").eq("cache_key", cacheKey).maybeSingle();
  if (row?.status === "ready" && row.storage_path) return { path: row.storage_path, generated: false };

  const path = `${cacheKey}.wav`; // deterministic: never a duplicate file
  await db.from("audio_assets").upsert({ cache_key: cacheKey, text: text.trim(), language, voice: VOICE, status: "pending", error: null, updated_at: new Date().toISOString() });
  try {
    const audio = await synthesize(text, language);
    const { error: upError } = await db.storage.from(BUCKET).upload(path, audio.bytes, { contentType: audio.type, upsert: true });
    if (upError) throw upError;
    // Ready only after the file is verifiably stored.
    const { data: check } = await db.storage.from(BUCKET).list("", { search: path, limit: 1 });
    if (!check?.some((f) => f.name === path)) throw new Error("stored audio not found");
    await db.from("audio_assets").update({ status: "ready", storage_path: path, error: null, updated_at: new Date().toISOString() }).eq("cache_key", cacheKey);
    return { path, generated: true };
  } catch (e) {
    await db.from("audio_assets").update({ status: "failed", error: String(e instanceof Error ? e.message : e).slice(0, 300), updated_at: new Date().toISOString() }).eq("cache_key", cacheKey);
    throw e;
  }
}

export async function readAudio(path: string): Promise<Blob> {
  const db = await admin();
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error("audio missing");
  return data;
}
