"use client";

// Auth is handled entirely by middleware (cookie gate).
// This component is kept as a pass-through so no import changes are needed elsewhere.
export function GuestModeGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
