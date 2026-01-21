"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/**
 * Redirect from /prices to /services
 * This maintains backward compatibility for any bookmarked links
 */
export default function PricesRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;

  useEffect(() => {
    // Redirect to /services route
    const basePath = siteId === "me" ? "/site/me/admin" : `/site/${siteId}/admin`;
    router.replace(`${basePath}/services`);
  }, [siteId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto mb-4"></div>
        <p className="text-slate-600">מעביר...</p>
      </div>
    </div>
  );
}
