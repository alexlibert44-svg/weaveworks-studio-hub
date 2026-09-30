import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { I18nProvider } from "@/lib/i18n";
import { useDeviceId } from "@/hooks/use-device-id";
import { ensureLearner } from "@/lib/verba/api";
import type { Learner } from "@/lib/verba/types";

import { Onboarding } from "./Onboarding";

interface LearnerValue {
  deviceId: string;
  learner: Learner;
  /** Refetches the learner after a settings change. */
  refresh: () => void;
}

const LearnerContext = createContext<LearnerValue | null>(null);

export function useLearner(): LearnerValue {
  const value = useContext(LearnerContext);
  if (!value) throw new Error("useLearner must be used inside AppGate");
  return value;
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-7 animate-spin text-primary" />
    </div>
  );
}

/**
 * Resolves the learner before any screen renders, so the interface language,
 * text direction and the language pair are always known and never flicker.
 * A learner who hasn't answered the setup questions sees onboarding instead.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const deviceId = useDeviceId();
  const queryClient = useQueryClient();

  const { data: learner } = useQuery({
    queryKey: ["learner", deviceId],
    queryFn: () => ensureLearner(deviceId as string),
    enabled: Boolean(deviceId),
    staleTime: 60_000,
  });

  if (!deviceId || !learner) return <Splash />;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["learner", deviceId] });
  };

  return (
    <I18nProvider nativeCode={learner.native_language} targetCode={learner.learning_language}>
      <LearnerContext.Provider value={{ deviceId, learner, refresh }}>
        {learner.onboarding_completed ? children : <Onboarding />}
      </LearnerContext.Provider>
    </I18nProvider>
  );
}
