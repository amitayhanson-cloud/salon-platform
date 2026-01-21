"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserDocument } from "@/lib/firestoreUsers";

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

    // Get user's siteId and redirect to /site/{siteId}/admin
    const redirectToAdmin = async () => {
      try {
        const userDoc = await getUserDocument(user.id);
        if (userDoc?.siteId) {
          router.replace(`/site/${userDoc.siteId}/admin`);
        } else {
          // User has no site - redirect to builder
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
