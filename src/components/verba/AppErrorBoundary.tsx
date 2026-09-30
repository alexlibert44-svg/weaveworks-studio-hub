import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportLovableError } from "@/lib/lovable-error-reporting";

interface State {
  error: Error | null;
}

/** Last-resort boundary: any render crash shows a helpful screen, never a blank page. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    reportLovableError(error, { boundary: "app_error_boundary" });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6" role="alert">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            LingoFlow hit an unexpected problem. Your words and progress are safe.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.assign("/")}
              className="rounded-xl border border-input px-4 py-2 text-sm font-semibold text-foreground"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
