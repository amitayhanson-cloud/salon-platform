"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";

const ADMIN_RETURN_TO = "admin";

/**
 * Link/button for "לפאנל ניהול":
 * - Authenticated → button that fetches /api/dashboard-redirect and redirects to tenant admin
 * - Not authenticated → Link to /login?returnTo=admin
 */
export function AdminPanelLink({
  className,
  children = "לפאנל ניהול",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { firebaseUser, loading } = useAuth();
  const [navigating, setNavigating] = useState(false);

  const goToAdmin = async () => {
    if (!firebaseUser || navigating) return;
    setNavigating(true);
    try {
      const token = await firebaseUser.getIdToken(true);
      const res = await fetch("/api/dashboard-redirect", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 403 && data.error === "no_tenant") {
        window.location.href = "/login?error=no_tenant";
        return;
      }
      if (res.ok && typeof data.url === "string" && data.url) {
        window.location.assign(data.url);
        return;
      }
    } catch (e) {
      console.error("[AdminPanelLink] Redirect failed:", e);
    }
    window.location.href = `/login?returnTo=${encodeURIComponent(ADMIN_RETURN_TO)}`;
    setNavigating(false);
  };

  if (loading) {
    return (
      <span className={className} aria-hidden>
        {children}
      </span>
    );
  }

  if (firebaseUser) {
    return (
      <button
        type="button"
        onClick={goToAdmin}
        disabled={navigating}
        className={className}
      >
        {navigating ? "מעביר..." : children}
      </button>
    );
  }

  return (
    <Link href={`/login?returnTo=${encodeURIComponent(ADMIN_RETURN_TO)}`} className={className}>
      {children}
    </Link>
  );
}
