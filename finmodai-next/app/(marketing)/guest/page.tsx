"use client";

import { AuthPage } from "@/components/auth/AuthPage";

export default function GuestPage() {
  return <AuthPage initialMode={"guest" as any} />;
}
