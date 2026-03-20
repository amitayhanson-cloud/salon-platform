import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/firestoreTemplatesServer";
import type { SiteConfig } from "@/types/siteConfig";

export const dynamic = "force-dynamic";

const BUSINESS_TO_SALON_TYPE: Record<string, SiteConfig["salonType"]> = {
  hair: "hair",
  barber: "barber",
  nails: "nails",
  spa: "spa",
  mixed: "mixed",
  other: "other",
};

export async function GET() {
  try {
    const templates = await listTemplates();
    const mapped = templates
      .map((t) => {
        const salonType = BUSINESS_TO_SALON_TYPE[t.businessType];
        if (!salonType) return null;
        return {
          templateKey: t.templateKey,
          salonType,
          label: t.displayName || t.businessType,
        };
      })
      .filter((t): t is { templateKey: string; salonType: SiteConfig["salonType"]; label: string } => Boolean(t));

    return NextResponse.json({ success: true, templates: mapped });
  } catch (error) {
    console.error("[GET /api/templates] failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load templates" },
      { status: 500 }
    );
  }
}

