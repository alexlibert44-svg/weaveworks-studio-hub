import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useRouterState } from "@tanstack/react-router";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { I18nProvider } from "@/lib/i18n";
import { ensureLearner } from "@/lib/verba/api";
import type { Learner } from "@/lib/verba/types";

import { Onboarding } from "./Onboarding";

interface LearnerValue {
  /** The signed-in user's id; every row is owned by it. */
  deviceId: string;
  email: string | null;
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

/** Routes reachable without an account. */
const PUBLIC_PATHS = ["/auth", "/reset-password"];

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-7 animate-spin text-primary" />
    </div>
  );
}

/** Interface language before sign-in: the browser's language when supported. */
function browserLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  const code = navigator.language.slice(0, 2).toLowerCase();
  return ["ar", "fr", "es", "en"].includes(code) ? code : "en";
}

/**
 * Resolves the signed-in user and their learner settings before any screen
 * renders. Signed-out visitors only see the sign-in and password pages.
 */
export function AppGate({ children }: { children: ReactNode }) {
  // The resolved location matches what <Outlet /> is actually rendering during transitions.
  const pathname = useRouterState({
    select: (s) => s.resolvedLocation?.pathname ?? s.location.pathname,
  });
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [guestLang, setGuestLang] = useState("en");

  useEffect(() => {
    setGuestLang(browserLanguage());
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_OUT") queryClient.clear();
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void queryClient.invalidateQueries();
    });
    void supabase.auth.getSession().then(({ data: current }) => setSession(current.session));
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id ?? null;
  const { data: learner } = useQuery({
    queryKey: ["learner", userId],
    queryFn: () => ensureLearner(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (session === undefined) return <Splash />;

  if (isPublic) {
    return (
      <I18nProvider nativeCode={learner?.native_language ?? guestLang} targetCode={learner?.learning_language ?? "en"}>
        {children}
      </I18nProvider>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  if (!learner) return <Splash />;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["learner", userId] });
  };

  return (
    <I18nProvider nativeCode={learner.native_language} targetCode={learner.learning_language}>
      <LearnerContext.Provider
        value={{ deviceId: session.user.id, email: session.user.email ?? null, learner, refresh }}
      >
        {learner.onboarding_completed ? children : <Onboarding />}
      </LearnerContext.Provider>
    </I18nProvider>
  );
}
