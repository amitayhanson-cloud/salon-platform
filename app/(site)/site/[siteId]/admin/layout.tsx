"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";

// Admin routes are dynamic - they require authentication and load user data
export const dynamic = "force-dynamic";
import AdminHeader from "@/components/admin/AdminHeader";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, firebaseUser, loading: authLoading, authReady } = useAuth();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [initializing, setInitializing] = useState(false);
  const [ownershipRepairError, setOwnershipRepairError] = useState<string | null>(null);
  const siteId = params.siteId as string;

  // Prevent redirect loops
  const redirectAttempted = useRef(false);
  const lastCheckedUid = useRef<string | null>(null);

  function isPermissionError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string })?.code;
    const name = (err as { name?: string })?.name;
    return (
      code === "permission-denied" ||
      name === "FirebaseError" ||
      /missing or insufficient permissions/i.test(msg)
    );
  }

  useEffect(() => {
    // Don't check until auth is ready
    if (!authReady || authLoading) {
      if (process.env.NODE_ENV === "development") {
        console.log("[ADMIN GUARD] Waiting for auth", { authReady, authLoading });
      }
      return;
    }

    // Not logged in - redirect to login with returnTo parameter
    if (!user) {
      const loginPath = `/login?returnTo=${encodeURIComponent(`/site/${siteId}/admin`)}`;
      
      // Prevent redirect loop: don't redirect if already on login page
      if (pathname?.startsWith("/login")) {
        if (process.env.NODE_ENV === "development") {
          console.log("[ADMIN GUARD] Already on login page, skipping redirect", {
            pathname,
            authReady,
            authLoading
          });
        }
        return;
      }
      
      if (!redirectAttempted.current) {
        redirectAttempted.current = true;
        if (process.env.NODE_ENV === "development") {
          console.log("[ADMIN GUARD] Not logged in, action=redirect to /login with returnTo", {
            pathname,
            targetPath: loginPath,
            authReady,
            authLoading
          });
        }
        router.replace(loginPath);
      }
      return;
    }

    // Prevent checking the same user multiple times if already authorized
    if (lastCheckedUid.current === user.id && authorized) {
      if (process.env.NODE_ENV === "development") {
        console.log("[ADMIN GUARD] Already authorized for this user, skipping check");
      }
      setChecking(false);
      return;
    }

    // Reset redirect flag if user changed
    if (lastCheckedUid.current !== user.id) {
      redirectAttempted.current = false;
    }

    const checkAuthorization = async () => {
      setOwnershipRepairError(null);
      if (process.env.NODE_ENV === "development") {
        console.log("[ADMIN GUARD] Checking authorization", {
          authReady,
          uid: user.id,
          routeSiteId: siteId,
        });
      }

      const { getSite, backfillSiteOwnerUid, verifySiteOwnership } = await import("@/lib/firestoreSites");

      let site: Awaited<ReturnType<typeof getSite>> = null;
      try {
        site = await getSite(siteId);
      } catch (getSiteError) {
        console.warn("[ADMIN GUARD] getSite failed", {
          siteId,
          errorMessage: getSiteError instanceof Error ? getSiteError.message : String(getSiteError),
          errorCode: (getSiteError as { code?: string })?.code,
          userSiteId: user.siteId,
          willAttemptRepair: isPermissionError(getSiteError) && user.siteId === siteId && !!firebaseUser,
        });

        if (isPermissionError(getSiteError) && user.siteId === siteId && firebaseUser) {
          const repairUrl =
            typeof window !== "undefined"
              ? `${window.location.origin}/api/repair-site-ownership`
              : "/api/repair-site-ownership";
          console.log("[ADMIN GUARD] Attempting repair", { repairUrl, siteId });

          try {
            const token = await firebaseUser.getIdToken(true);
            if (!token) {
              console.error("[ADMIN GUARD] getIdToken returned empty");
              setOwnershipRepairError("שגיאת אימות. נסה להתחבר מחדש.");
              setChecking(false);
              setAuthorized(false);
              return;
            }
            const res = await fetch(repairUrl, {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ siteId }),
            });
            const data = await res.json().catch(() => ({}));
            console.log("[ADMIN GUARD] Repair API response", {
              url: repairUrl,
              status: res.status,
              ok: res.ok,
              body: data,
            });

            if (!res.ok) {
              const serverMsg = data?.message || data?.error || res.statusText;
              console.error("[ADMIN GUARD] Repair API failed", { status: res.status, body: data });
              setOwnershipRepairError(
                `תיקון הרשאות נכשל: ${serverMsg}. נדרש תיקון מהשרת – פנה למנהל המערכת.`
              );
              setChecking(false);
              setAuthorized(false);
              return;
            }
            console.log("[ADMIN GUARD] Repair succeeded, re-fetching site");
            site = await getSite(siteId);
          } catch (repairOrRetryError) {
            console.error("[ADMIN GUARD] Repair or retry failed", {
              error: repairOrRetryError,
              message: repairOrRetryError instanceof Error ? repairOrRetryError.message : String(repairOrRetryError),
            });
            setOwnershipRepairError(
              "לא ניתן לטעון את האתר. נדרש תיקון הרשאות בשרת – פנה למנהל המערכת או הרץ תיקון מהשרת."
            );
            setChecking(false);
            setAuthorized(false);
            return;
          }
        } else {
          console.error("[ADMIN GUARD] Error checking authorization:", getSiteError);
          setChecking(false);
          setAuthorized(false);
          return;
        }
      }

      try {
        if (!site) {
          // Site doesn't exist - show error UI (NOT redirect to builder)
          if (process.env.NODE_ENV === "development") {
            console.log(`[ADMIN GUARD] Site ${siteId} not found`);
          }
          setChecking(false);
          setAuthorized(false); // Will show error UI
          return;
        }

        // Backfill ownerUid if missing (one-time migration for existing sites)
        // This runs silently in the background and doesn't block authorization
        const siteOwnerUid = (site as any).ownerUid;
        if (!siteOwnerUid) {
          if (process.env.NODE_ENV === "development") {
            console.log(`[ADMIN GUARD] Site ${siteId} missing ownerUid, attempting backfill`);
          }
          // Try to backfill based on user's siteId
          backfillSiteOwnerUid(user.id).catch((err) => {
            console.error("[ADMIN GUARD] Backfill failed (non-fatal):", err);
          });
        }

        // Verify site ownership: sites/{siteId}.ownerUid === current uid
        const isOwner = await verifySiteOwnership(siteId, user.id);
        if (!isOwner) {
          // User is not the owner of this site
          if (!redirectAttempted.current) {
            redirectAttempted.current = true;
            if (process.env.NODE_ENV === "development") {
              console.log(`[ADMIN GUARD] Access denied: uid=${user.id} is not owner of siteId=${siteId}`);
              console.log(`[ADMIN GUARD] Site ownerUid=${siteOwnerUid}, user.uid=${user.id}`);
            }

            // Get user's own siteId and redirect to their admin (if they have one)
            const { getUserDocument } = await import("@/lib/firestoreUsers");
            const userDoc = await getUserDocument(user.id);
            
            if (userDoc?.siteId) {
              // User has their own site - redirect to their admin (only if different)
              const targetPath = `/site/${userDoc.siteId}/admin`;
              if (pathname === targetPath) {
                // Already on target page, don't redirect
                if (process.env.NODE_ENV === "development") {
                  console.log(`[ADMIN GUARD] Already on ${targetPath}, skipping redirect`);
                }
                setChecking(false);
                setAuthorized(false);
                return;
              }
              
              if (process.env.NODE_ENV === "development") {
                console.log(`[ADMIN GUARD] Redirecting to user's own site admin`, {
                  currentPath: pathname,
                  targetPath
                });
              }
              router.replace(targetPath);
            } else {
              // User has no site - show 403 error (NOT redirect to builder)
              // The admin guard should never redirect to /builder
              setChecking(false);
              setAuthorized(false); // Will show 403 UI
            }
          }
          return;
        }

        // User is authorized (verified ownership)
        lastCheckedUid.current = user.id;
        setAuthorized(true);
        setChecking(false);
        
        if (process.env.NODE_ENV === "development") {
          console.log(`[ADMIN GUARD] Authorized uid=${user.id}, routeSiteId=${siteId} (verified ownership)`);
        }
      } catch (error) {
        console.error("[ADMIN GUARD] Error checking authorization:", error);
        setChecking(false);
        setAuthorized(false); // Show error UI instead of redirecting
      }
    };

    checkAuthorization();
  }, [user, firebaseUser, authLoading, authReady, siteId, router, authorized, pathname]);

  // Show loading state
  if (authLoading || checking || initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto mb-4"></div>
          <p className="text-slate-600">
            {initializing ? "מאתחל את האתר שלך..." : "בודק הרשאות..."}
          </p>
        </div>
      </div>
    );
  }

  // Show error UI if not authorized (instead of redirecting to builder)
  if (!authorized && !checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md text-right">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">גישה נדחתה</h1>
          <p className="text-slate-600 mb-6">
            {ownershipRepairError || "אין לך הרשאה לגשת לפאנל הניהול של אתר זה."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              חזרה לדף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if still checking
  if (!authorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
