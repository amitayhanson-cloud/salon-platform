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
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-[#1E6F7C]"></div>
        <p className="text-[#64748B]">מעביר...</p>
      </div>
    </div>
  );
}
