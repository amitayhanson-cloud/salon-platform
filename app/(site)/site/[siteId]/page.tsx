"use client";

import { useParams } from "next/navigation";
import SiteRenderer from "./SiteRenderer";

export default function SalonSitePage() {
  const params = useParams();
  const siteId = params?.siteId as string;

  if (!siteId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-right px-4">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          האתר לא נמצא
        </h1>
        <p className="text-sm text-slate-600 max-w-md">
          siteId חסר
        </p>
      </div>
    );
  }

  return <SiteRenderer siteId={siteId} />;
}

