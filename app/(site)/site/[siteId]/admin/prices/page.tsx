"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getAdminBasePathFromSiteId } from "@/lib/url";

/**
 * Redirect from /prices to /services
 * This maintains backward compatibility for any bookmarked links
 */
export default function PricesRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;

  useEffect(() => {
    const basePath = getAdminBasePathFromSiteId(siteId);
    router.replace(`${basePath}/services`);
  }, [siteId, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-caleno-deep mx-auto mb-4"></div>
        <p className="text-[#64748B]">מעביר...</p>
      </div>
    </div>
  );
}
