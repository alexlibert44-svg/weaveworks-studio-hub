import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The three softly lit circular accents used by LingoFlow's Home frame. */
export function SignatureFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("signature-frame bg-hero-gradient animate-rise relative -mx-5 -mt-6 overflow-hidden rounded-b-4xl px-5 pt-8 pb-9 text-hero-foreground shadow-card", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -end-14 -top-16 size-52 rounded-full bg-hero-circle-blue opacity-30" />
      <div aria-hidden="true" className="pointer-events-none absolute end-6 top-24 size-24 rounded-full bg-hero-circle-purple opacity-35" />
      <div aria-hidden="true" className="pointer-events-none absolute -start-14 bottom-2 size-40 rounded-full bg-hero-circle-blue opacity-20" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}