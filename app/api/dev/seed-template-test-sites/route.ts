import { NextResponse } from "next/server";
import { runSeedTemplateTestSites } from "@/lib/seedTemplateTestSitesServer";

/**
 * POST /api/dev/seed-template-test-sites
 * Development only: seeds sites/test-barber and sites/test-nails (same as npm script).
 */
export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: "Only available in development." },
      { status: 403 }
    );
  }

  try {
    const result = await runSeedTemplateTestSites();
    return NextResponse.json({
      success: true,
      siteIds: result.siteIds,
      paths: result.paths,
      hint: {
        barber: "/site/test-barber",
        nails: "/site/test-nails",
      },
    });
  } catch (err) {
    console.error("[seed-template-test-sites]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
