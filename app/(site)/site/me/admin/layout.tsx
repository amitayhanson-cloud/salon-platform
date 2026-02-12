"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserDocument } from "@/lib/firestoreUsers";
import { getDashboardUrl } from "@/lib/url";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, authReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authReady) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    const redirectToAdmin = async () => {
      try {
        const userDoc = await getUserDocument(user.id);
        if (userDoc?.siteId) {
          const url = getDashboardUrl({
            slug: userDoc.primarySlug ?? null,
            siteId: userDoc.siteId,
          });
          if (url.startsWith("http")) {
            window.location.href = url;
          } else {
            router.replace(url);
          }
        } else {
          router.replace("/builder");
        }
      } catch (error) {
        console.error("[AdminLayout /me] Error getting user siteId:", error);
        router.replace("/builder");
      }
    };

    redirectToAdmin();
  }, [user, authReady, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
        <p className="text-slate-600">מעביר...</p>
      </div>
    </div>
  );
}
