import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Freemium layer (UI + gating only). There is NO payment system yet, so every
 * learner is on the Free plan. When real billing exists, replace
 * `fetchEntitlement` with a server-verified read (e.g. a subscriptions table
 * written only by a verified payment webhook) and enforce the same limits in
 * the database (trigger on word_sets insert, checks in premium server
 * functions). Never grant Premium from client state.
 */
export type Plan = "free" | "premium";

export const FREE_DAILY_SETS = 4;

async function fetchEntitlement(): Promise<Plan> {
  return "free";
}

async function setsCreatedToday(deviceId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("word_sets")
    .select("id", { count: "exact", head: true })
    .eq("device_id", deviceId)
    .gte("created_at", start.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export function usePlan(deviceId: string) {
  const plan = useQuery({ queryKey: ["plan", deviceId], queryFn: fetchEntitlement });
  const today = useQuery({ queryKey: ["sets-today", deviceId], queryFn: () => setsCreatedToday(deviceId) });
  const isPremium = plan.data === "premium";
  const used = today.data ?? 0;
  return {
    plan: plan.data ?? "free",
    isPremium,
    loaded: plan.isSuccess && today.isSuccess,
    /** null = unlimited. */
    remaining: isPremium ? null : Math.max(0, FREE_DAILY_SETS - used),
  };
}
