/**
 * GET /api/landing-content
 * Public read of platform landing page content (for rendering the marketing landing page).
 */
import { NextResponse } from "next/server";
import { getLandingContentServer } from "@/lib/firestoreLandingServer";

export async function GET() {
  try {
    const content = await getLandingContentServer();
    return NextResponse.json(content, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (e) {
    console.error("[landing-content]", e);
    return NextResponse.json(
      { error: "Failed to load landing content" },
      { status: 500 }
    );
  }
}
