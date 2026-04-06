"use client";

import { useEffect, useState, useRef, type ReactNode } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";

// Admin routes are dynamic - they require authentication and load user data
export const dynamic = "force-dynamic";
import AdminHeader from "@/components/admin/AdminHeader";
import { AdminPanelFooter } from "@/components/admin/AdminPanelFooter";
import { AdminHelpPanel } from "@/components/admin/AdminHelpPanel";
import { UnsavedChangesProvider } from "@/components/admin/UnsavedChangesContext";
import {
  MobileImmersiveSiteEditorProvider,
  useMobileImmersiveSiteEditor,
} from "@/components/admin/MobileImmersiveSiteEditorContext";
import { NavigationLoadingLayer } from "@/components/navigation/NavigationLoadingLayer";
import { adminNavigationPredicate } from "@/components/navigation/navigationLoadingPredicates";
import { useAuth } from "@/components/auth/AuthProvider";
import { TenantInlineLoading } from "@/components/navigation/TenantInlineLoading";

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
  const [lazyCleanupToast, setLazyCleanupToast] = useState<string | null>(null);
  const lazyCleanupTriggeredRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);

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
        console.log("[CLIENT AUTH]", "waiting", { authReady, authLoading });
      }
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[CLIENT AUTH]", firebaseUser?.uid ?? null, { loading: authLoading });
    }

    // Not logged in -> redirect to /login on SAME host (preserves origin so auth persists after login)
    // Use firebaseUser as source of truth for auth (user doc can be null if Firestore fetch failed/slow)
    if (!firebaseUser) {
      const loginPath = "/login?returnTo=admin";
      
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
          console.log("[ADMIN GUARD] Not logged in, redirect to /login on same host", {
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

    const uid = firebaseUser.uid;
    const userSiteId = user?.siteId;

    // Prevent checking the same user multiple times if already authorized.
    // Do not call setState here — skipping the check should not trigger a re-render and risk a loop.
    if (lastCheckedUid.current === uid && authorized) {
      if (process.env.NODE_ENV === "development") {
        console.log("[ADMIN GUARD] Already authorized for this user, skipping check");
      }
      return;
    }

    // Reset redirect flag if user changed
    if (lastCheckedUid.current !== uid) {
      redirectAttempted.current = false;
    }

    const checkAuthorization = async () => {
      setOwnershipRepairError(null);
      if (process.env.NODE_ENV === "development") {
        console.log("[ADMIN GUARD] Checking authorization", {
          authReady,
          uid,
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
          userSiteId: userSiteId,
          willAttemptRepair: isPermissionError(getSiteError) && userSiteId === siteId && !!firebaseUser,
        });

        if (isPermissionError(getSiteError) && userSiteId === siteId && firebaseUser) {
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
          backfillSiteOwnerUid(uid).catch((err) => {
            console.error("[ADMIN GUARD] Backfill failed (non-fatal):", err);
          });
        }

        // Verify site ownership: sites/{siteId}.ownerUid === current uid
        const isOwner = await verifySiteOwnership(siteId, uid);
        if (!isOwner) {
          // User is not the owner of this site
          if (!redirectAttempted.current) {
            redirectAttempted.current = true;
            if (process.env.NODE_ENV === "development") {
              console.log(`[ADMIN GUARD] Access denied: uid=${uid} is not owner of siteId=${siteId}`);
              console.log(`[ADMIN GUARD] Site ownerUid=${siteOwnerUid}, user.uid=${uid}`);
            }

            // Redirect to user's correct tenant (API = single source of truth, supports custom domain)
            try {
              const token = firebaseUser ? await firebaseUser.getIdToken(true) : null;
              if (token) {
                const res = await fetch("/api/dashboard-redirect", {
                  method: "GET",
                  headers: { Authorization: `Bearer ${token}` },
                  cache: "no-store",
                });
                const data = (await res.json().catch(() => ({}))) as { url?: string };
                if (res.ok && typeof data.url === "string" && data.url) {
                  if (process.env.NODE_ENV === "development") {
                    console.log("[ADMIN GUARD] hostTenantId=%s userTenantId=mismatch redirect=%s (tenant isolation)", siteId, data.url);
                  }
                  window.location.assign(data.url);
                  return;
                }
              }
            } catch (e) {
              console.error("[ADMIN GUARD] dashboard-redirect failed:", e);
            }
            setChecking(false);
            setAuthorized(false);
          }
          return;
        }

        // User is authorized (verified ownership)
        lastCheckedUid.current = uid;
        setAuthorized(true);
        setChecking(false);
        
        if (process.env.NODE_ENV === "development") {
          console.log(`[ADMIN GUARD] Authorized uid=${uid}, routeSiteId=${siteId} (verified ownership)`);
        }
      } catch (error) {
        console.error("[ADMIN GUARD] Error checking authorization:", error);
        setChecking(false);
        setAuthorized(false); // Show error UI instead of redirecting
      }
    };

    checkAuthorization();
  }, [user, firebaseUser, authLoading, authReady, siteId, router, authorized, pathname]);

  // Lazy daily cleanup: trigger once per session when admin first opens app
  useEffect(() => {
    if (!authorized || !siteId || !firebaseUser || lazyCleanupTriggeredRef.current) return;
    lazyCleanupTriggeredRef.current = true;

    (async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch("/api/admin/ensure-daily-cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ siteId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ran === true) {
          setLazyCleanupToast("בוצע ניקוי אוטומטי לתורים שפג תוקפם");
        }
      } catch {
        // Silent – do not block UI or show error for background cleanup
      }
    })();
  }, [authorized, siteId, firebaseUser]);

  // Auto-dismiss lazy cleanup toast
  useEffect(() => {
    if (!lazyCleanupToast) return;
    const t = setTimeout(() => setLazyCleanupToast(null), 4000);
    return () => clearTimeout(t);
  }, [lazyCleanupToast]);

  // Show loading state
  if (authLoading || checking || initializing) {
    return (
      <div className="min-h-screen flex w-full items-center justify-center bg-[#F8FAFC]">
        <TenantInlineLoading />
      </div>
    );
  }

  // Show error UI if not authorized (instead of redirecting to builder)
  if (!authorized && !checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]" dir="rtl">
        <div className="max-w-md rounded-xl border border-[#E2E8F0] bg-white p-8 text-right shadow-sm">
          <h1 className="text-2xl font-bold text-[#0F172A] mb-4">גישה נדחתה</h1>
          <p className="text-[#64748B] mb-6">
            {ownershipRepairError || "אין לך הרשאה לגשת לפאנל הניהול של אתר זה."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                try {
                  const token = firebaseUser ? await firebaseUser.getIdToken(true) : null;
                  if (token) {
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
                  }
                } catch {
                  // fallback
                }
                router.push("/login?returnTo=admin");
              }}
              className="rounded-lg bg-[#0F172A] px-4 py-2 text-white shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md"
            >
              לפאנל הניהול שלי
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-[#E2E8F0] px-4 py-2 text-[#0F172A] transition-colors hover:bg-[rgba(15,23,42,0.04)]"
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

  // Print route: no header, no nav, no chrome – only the printable calendar
  const isPrintRoute = typeof pathname === "string" && pathname.includes("/bookings/print");
  if (isPrintRoute) {
    return (
      <div className="print-route-root" style={{ overflow: "visible", height: "auto", minHeight: 0, background: "#fff" }}>
        <style dangerouslySetInnerHTML={{ __html: `
          .print-route-root { background: #fff; overflow: visible !important; height: auto !important; min-height: 0 !important; }
          @media print {
            .print-route-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        ` }} />
        {children}
      </div>
    );
  }

  const isDayView = typeof pathname === "string" && pathname.includes("/bookings/day");

  return (
    <NavigationLoadingLayer
      variant="tenant"
      tenantLogoUrl={null}
      shouldShowForNavigation={adminNavigationPredicate}
    >
      <div className="relative min-h-screen w-full overflow-x-clip">
        {/* Fixed radial gradient: Caleno at center, white at edges (match landing) */}
        <div
          aria-hidden
          className="fixed inset-0 -z-10"
          style={{
            backgroundImage: "radial-gradient(ellipse 100% 100% at 50% 50%, #cceef1 0%, #e6f5f7 25%, #f0f9fa 50%, #f8fcfd 75%, #ffffff 100%)",
          }}
        />
        {lazyCleanupToast && (
          <div
            role="alert"
            className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm text-white shadow-lg"
          >
            {lazyCleanupToast}
          </div>
        )}
        <UnsavedChangesProvider>
          <MobileImmersiveSiteEditorProvider>
            <AdminStandardChrome isDayView={isDayView} helpOpen={helpOpen} setHelpOpen={setHelpOpen}>
              {children}
            </AdminStandardChrome>
          </MobileImmersiveSiteEditorProvider>
        </UnsavedChangesProvider>
      </div>
    </NavigationLoadingLayer>
  );
}

type AdminStandardChromeProps = {
  children: ReactNode;
  isDayView: boolean;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
};

function AdminStandardChrome({ children, isDayView, helpOpen, setHelpOpen }: AdminStandardChromeProps) {
  const { immersiveMobileSiteEditor } = useMobileImmersiveSiteEditor();

  return (
    <div className="relative z-10 w-full overflow-x-clip">
      <div
        className={`relative z-40 admin-layout-header-root${immersiveMobileSiteEditor ? " max-md:hidden" : ""}`}
      >
        <AdminHeader onOpenHelp={() => setHelpOpen(true)} />
      </div>
      <AdminHelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <main
        className={`relative z-0 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${isDayView ? "pt-0 pb-4" : "py-8"} ${
          immersiveMobileSiteEditor ? "max-md:max-w-none max-md:px-0 max-md:py-0" : ""
        }`}
      >
        {children}
      </main>
      {!immersiveMobileSiteEditor ? <AdminPanelFooter /> : null}
    </div>
  );
}
