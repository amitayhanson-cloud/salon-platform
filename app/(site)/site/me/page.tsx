"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getUserDocument } from "@/lib/firestoreUsers";

export default function MySitePage() {
  const { firebaseUser, authReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authReady) return;

    if (!firebaseUser) {
      router.replace("/login?returnTo=admin");
      return;
    }

    // Get user's siteId and redirect to /site/{siteId}
    const redirectToSite = async () => {
      try {
        const userDoc = await getUserDocument(firebaseUser.uid);
        if (userDoc?.siteId) {
          router.replace(`/site/${userDoc.siteId}`);
        } else {
          // User has no site - redirect to builder
          router.replace("/builder");
        }
      } catch (error) {
        console.error("[MySitePage] Error getting user siteId:", error);
        router.replace("/builder");
      }
    };

    redirectToSite();
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
