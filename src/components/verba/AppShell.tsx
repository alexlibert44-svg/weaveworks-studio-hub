import type { ReactNode } from "react";

import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-md px-5 pt-6 pb-28">{children}</main>
      <BottomNav />
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-5 animate-rise">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
    </header>
  );
}
