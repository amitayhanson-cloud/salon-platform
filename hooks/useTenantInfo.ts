"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getDashboardUrl, getAdminUrl } from "@/lib/url";

export type TenantInfo = {
  slug: string | null;
  siteId: string | null;
  publicUrl: string | null;
  dashboardUrl: string;
  /** (path) => full admin URL or path for the given sub-path */
  adminUrl: (path?: string) => string;
};

/**
 * Single source for current user's tenant (subdomain) info.
 * Fetches /api/tenants/me once when logged in; use for dashboard links so subdomain is preferred.
 */
export function useTenantInfo(): {
  data: TenantInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, firebaseUser } = useAuth();
  const [data, setData] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    if (!firebaseUser) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/tenants/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setData(null);
        setError(json.error ?? "Failed to load tenant");
        return;
      }
      const slug = json.slug ?? null;
      const siteId = json.siteId ?? null;
      const publicUrl = json.publicUrl ?? null;
      const dashboardUrl = getDashboardUrl({ slug, siteId });
      const adminUrl = (path?: string) => getAdminUrl({ slug, siteId, path });
      setData({ slug, siteId, publicUrl, dashboardUrl, adminUrl });
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load tenant");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return { data, loading, error, refetch: fetchMe };
}
