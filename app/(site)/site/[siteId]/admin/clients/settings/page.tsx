"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAdminBasePathFromSiteId } from "@/lib/url";

export default function ClientSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;
  const basePath = getAdminBasePathFromSiteId(siteId);

  useEffect(() => {
    if (!siteId) return;
    router.replace(`${basePath}/settings?tab=clientStatus`);
  }, [router, siteId, basePath]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-slate-600 text-sm">מעביר להגדרות…</p>
    </div>
  );
}
