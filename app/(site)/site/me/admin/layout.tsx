"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, firebaseUser, authReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authReady) return;

    if (!firebaseUser) {
      router.replace("/login?returnTo=admin");
      return;
    }

    const redirectToAdmin = async () => {
      try {
        const token = firebaseUser ? await firebaseUser.getIdToken(true) : null;
        if (!token) {
          router.replace("/login?returnTo=admin");
          return;
        }
        const res = await fetch("/api/dashboard-redirect", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = (await res.json().catch(() => ({}))) as { url?: string };
        if (res.ok && typeof data.url === "string" && data.url) {
          window.location.assign(data.url);
          return;
        }
        router.replace("/login?returnTo=admin");
      } catch (error) {
        console.error("[AdminLayout /me] Error redirecting:", error);
        router.replace("/login?returnTo=admin");
      }
    };

    redirectToAdmin();
  }, [firebaseUser, authReady, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
        <p className="text-slate-600">מעביר...</p>
      </div>
    </div>
  );
}
