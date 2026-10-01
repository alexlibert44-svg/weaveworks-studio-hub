import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  language: z.string().trim().min(2).max(40),
  texts: z.array(z.string().trim().min(1).max(600)).min(1).max(40),
});

/**
 * Pre-generates and stores audio during set preparation. Already-stored audio
 * is reused (no TTS call). Returns the texts whose audio could not be stored.
 */
export const prepareAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const { ensureAudio } = await import("./tts.server");
    const failed: string[] = [];
    const unique = [...new Set(data.texts)];
    for (let i = 0; i < unique.length; i += 3) {
      await Promise.all(
        unique.slice(i, i + 3).map((text) => ensureAudio(text, data.language).catch(() => void failed.push(text))),
      );
    }
    return { failed };
  });
