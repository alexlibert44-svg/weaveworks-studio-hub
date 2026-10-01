import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Speech audio for words and sentences. Served from persistent storage; the
 * TTS model is called only when no stored copy exists yet (then stored).
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

        const { ensureAudio, readAudio } = await import("@/lib/verba/tts.server");
        try {
          const { path, generated } = await ensureAudio(parsed.data.text, parsed.data.language);
          const blob = await readAudio(path);
          return new Response(blob, {
            headers: {
              "content-type": blob.type || "audio/wav",
              "cache-control": "private, max-age=31536000, immutable",
              "x-audio-source": generated ? "generated" : "stored",
            },
          });
        } catch (e) {
          const status = (e as { status?: number }).status ?? 502;
          return new Response("Audio unavailable", { status });
        }
      },
    },
  },
});
