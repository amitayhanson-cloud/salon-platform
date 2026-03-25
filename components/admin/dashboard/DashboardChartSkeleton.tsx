"use client";

import Skeleton from "@mui/material/Skeleton";

/** Shimmer placeholder for MUI bar chart area while `/api/admin/dashboard-chart-series` loads */
export function DashboardChartSkeleton() {
  return (
    <div className="pointer-events-none select-none space-y-3 px-1 pt-1" aria-hidden>
      <Skeleton
        variant="rounded"
        height={20}
        animation="wave"
        className="mx-auto max-w-[180px]"
        sx={{ bgcolor: "rgba(30, 111, 124, 0.14)" }}
      />
      <Skeleton
        variant="rounded"
        height={228}
        animation="wave"
        className="w-full"
        sx={{ bgcolor: "rgba(30, 111, 124, 0.1)", borderRadius: 2 }}
      />
      <div className="flex justify-center gap-1.5 opacity-90" dir="ltr">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton
            key={i}
            variant="rounded"
            width={i % 3 === 0 ? 32 : 24}
            height={8}
            animation="wave"
            sx={{ bgcolor: "rgba(30, 111, 124, 0.12)" }}
          />
        ))}
      </div>
    </div>
  );
}
