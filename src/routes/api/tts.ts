import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Real text-to-speech for words and sentences. Returns a WAV file so the
 * browser plays genuine synthesized audio in the requested language.
 * Signed-in learners only.
 */
const Body = z.object({
  text: z.string().trim().min(1).max(600),
  language: z.string().trim().min(2).max(40),
});

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 401 means "sign in again" — the browser renews the token and retries
        // once before showing the learner anything.
        const signedOut = new Response("Your sign-in has expired. Please sign in again.", {
          status: 401,
        });
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return signedOut;
        const url = process.env["SUPABASE_URL"];
        const anon = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!url || !anon) return new Response("Not configured", { status: 500 });
        const supabase = createClient(url, anon, { auth: { persistSession: false } });
        const { data: user, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user.user) return signedOut;

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request", { status: 400 });

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Audio is not configured", { status: 500 });

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
                    text: `Read aloud in ${parsed.data.language}, slowly and clearly, like a language teacher: ${parsed.data.text}`,
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
            },
            stream_format: "audio",
          }),
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "audio/wav",
            "cache-control": "no-cache",
          },
        });
      },
    },
  },
});
