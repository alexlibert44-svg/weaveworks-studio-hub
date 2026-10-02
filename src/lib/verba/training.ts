import { supabase } from "@/integrations/supabase/client";

import { localDay } from "./api";

export type TrainingScope = "set" | "single";
export const MAX_POINTS: Record<TrainingScope, number> = { set: 15, single: 5 };

/** Result of a completed training session, computed by the database from real answers. */
export interface TrainingResult {
  id: string;
  duration_seconds: number;
  total: number;
  correct: number;
  incorrect: number;
  corrected: number;
  /** null when the session had no answers. */
  accuracy: number | null;
  points: number;
  scope: TrainingScope;
}

/** Opens a new training session row (always starts "active" with no results). */
export async function startTrainingSession(input: {
  id: string;
  setId: string | null;
  kind: "words" | "forms";
  targetLanguage: string;
  /** "single" = one Original Word / Derived Form (max 5 points); "set" = Word Set training (max 15). */
  scope?: TrainingScope;
}): Promise<void> {
  const { error } = await supabase.from("training_sessions").insert({
    id: input.id,
    set_id: input.setId,
    kind: input.kind,
    target_language: input.targetLanguage,
    scope: input.scope ?? "set",
  });
  // A retry of the same id is fine: the row already exists.
  if (error && error.code !== "23505") throw error;
}

/** Completes the session once; repeated calls return the same saved result. */
export async function completeTrainingSession(id: string, activeSeconds: number): Promise<TrainingResult> {
  const { data, error } = await supabase.rpc("complete_training_session", {
    _session_id: id,
    _local_day: localDay(),
    _active_seconds: Math.round(activeSeconds),
  });
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return {
    id: String(r["id"]),
    duration_seconds: Number(r["duration_seconds"] ?? 0),
    total: Number(r["total"] ?? 0),
    correct: Number(r["correct"] ?? 0),
    incorrect: Number(r["incorrect"] ?? 0),
    corrected: Number(r["corrected"] ?? 0),
    accuracy: r["accuracy"] == null ? null : Number(r["accuracy"]),
    points: Number(r["points"] ?? 0),
    scope: r["scope"] === "single" ? "single" : "set",
  };
}

/** Points rule shared with the database: ROUND(accuracy/100 × max), max 15 (set) or 5 (single). */
export function pointsFor(accuracy: number | null, scope: TrainingScope = "set"): number {
  return accuracy == null ? 0 : Math.round((accuracy / 100) * MAX_POINTS[scope]);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Counts active seconds only: the tab must be visible and the learner must
 * have interacted within the last 2 minutes, so idle time is left out.
 */
export function createActivityClock() {
  let seconds = 0;
  let lastInput = Date.now();
  const onInput = () => {
    lastInput = Date.now();
  };
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible" && Date.now() - lastInput < 120_000) seconds++;
  }, 1000);
  return {
    get seconds() {
      return seconds;
    },
    reset() {
      seconds = 0;
      lastInput = Date.now();
    },
    stop() {
      window.clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, onInput));
    },
  };
}
