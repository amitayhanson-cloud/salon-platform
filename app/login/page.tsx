"use client";

import LoginClient from "@/components/auth/LoginClient";

// Disable static prerendering - this page must be rendered dynamically
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginClient />;
}
