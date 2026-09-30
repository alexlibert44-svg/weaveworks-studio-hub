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
  // Decide from the match <Outlet /> is actually rendering, not the pending URL.
  const routeId = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.routeId ?? "" });
  const pathname = useRouterState({ select: (s) => s.resolvedLocation?.pathname ?? s.location.pathname });
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [guestLang, setGuestLang] = useState("en");

  useEffect(() => {
    setGuestLang(browserLanguage());
    let settled = false;
    const settle = (next: Session | null) => {
      settled = true;
      setSession(next);
    };
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // The first event can fire before a sign-in returning from Google has
      // been read from the address bar; getSession() below waits for that.
      if (event === "INITIAL_SESSION") return;
      settle(next);
      if (event === "SIGNED_OUT") queryClient.clear();
      if (event === "SIGNED_IN" || event === "USER_UPDATED") void queryClient.invalidateQueries();
    });
    supabase.auth
      .getSession()
      .then(({ data: current }) => settle(current.session))
      .catch((error) => {
        console.error("Session check failed", error);
        settle(null);
      });
    // Never hang on the splash: if the session check stalls, treat as signed out.
    const timer = window.setTimeout(() => {
      if (!settled) settle(null);
    }, 3000);
    return () => {
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id ?? null;
  const {
    data: learner,
    isError: learnerFailed,
    refetch: refetchLearner,
  } = useQuery({
    queryKey: ["learner", userId],
    queryFn: () => ensureLearner(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: 1,
  });
  const [learnerSlow, setLearnerSlow] = useState(false);
  useEffect(() => {
    setLearnerSlow(false);
    if (!userId || learner) return;
    const timer = window.setTimeout(() => setLearnerSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [userId, learner]);

  const isPublic = PUBLIC_PATHS.includes(routeId) && PUBLIC_PATHS.includes(pathname);

  if (session === undefined) return <Splash />;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["learner", userId] });
  };
  const value: LearnerValue | null =
    session && learner
      ? { deviceId: session.user.id, email: session.user.email ?? null, learner, refresh }
      : null;

  if (isPublic) {
    // Right after sign-in the app screen can render before the route id
    // updates, so still provide the learner whenever one exists.
    return (
      <I18nProvider nativeCode={learner?.native_language ?? guestLang} targetCode={learner?.learning_language ?? "en"}>
        <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>
      </I18nProvider>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  if (!learner || !value) {
    if (learnerFailed || learnerSlow) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <p className="text-sm text-muted-foreground">
            We couldn't load your account. Check your connection and try again.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setLearnerSlow(false);
                void refetchLearner();
              }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
            <button
              onClick={() => void supabase.auth.signOut().finally(() => setSession(null))}
              className="rounded-xl border border-input px-4 py-2 text-sm font-semibold"
            >
              Sign out
            </button>
          </div>
        </div>
      );
    }
    return <Splash />;
  }

  return (
    <I18nProvider nativeCode={learner.native_language} targetCode={learner.learning_language}>
      <LearnerContext.Provider value={value}>
        {learner.onboarding_completed ? children : <Onboarding />}
      </LearnerContext.Provider>
    </I18nProvider>
  );
}
