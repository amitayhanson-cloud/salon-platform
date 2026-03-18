/**
 * POST /api/bookings/resolve-repeat-selection
 * Resolves שירות + מחירון on the server (same data as admin) so public book page
 * can jump to step 4 even when client snapshot differs or loads late.
 */
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { REPEAT_SERVICE_NO_LONGER_AVAILABLE } from "@/lib/repeatBookingMessages";
import { resolveRepeatSelectionAdmin } from "@/lib/resolveRepeatSelectionAdmin";
import type { PricingItem } from "@/types/pricingItem";
import type { SiteService } from "@/types/siteConfig";

function mapPricingDoc(id: string, data: Record<string, unknown>): PricingItem {
  const serviceId = String(data.serviceId || data.service || "").trim();
  let durationMinMinutes: number;
  let durationMaxMinutes: number;
  if (
    typeof data.durationMinMinutes === "number" &&
    typeof data.durationMaxMinutes === "number"
  ) {
    durationMinMinutes = data.durationMinMinutes;
    durationMaxMinutes = data.durationMaxMinutes;
  } else if (typeof data.durationMinutes === "number") {
    durationMinMinutes = data.durationMinutes;
    durationMaxMinutes = data.durationMinutes;
  } else {
    durationMinMinutes = 30;
    durationMaxMinutes = 30;
  }
  const rawFollowUp = data.followUp as Record<string, unknown> | undefined;
  const fuPrice =
    rawFollowUp && typeof rawFollowUp.price === "number" && !Number.isNaN(rawFollowUp.price)
      ? Math.max(0, rawFollowUp.price)
      : undefined;
  const followUp =
    rawFollowUp &&
    typeof rawFollowUp.name === "string" &&
    String(rawFollowUp.name).trim() !== "" &&
    typeof rawFollowUp.durationMinutes === "number"
      ? {
          name: String(rawFollowUp.name).trim(),
          durationMinutes: Math.max(1, rawFollowUp.durationMinutes as number),
          waitMinutes:
            typeof rawFollowUp.waitMinutes === "number"
              ? Math.max(0, rawFollowUp.waitMinutes as number)
              : 0,
          ...(typeof rawFollowUp.serviceId === "string" &&
            String(rawFollowUp.serviceId).trim() !== "" && {
              serviceId: String(rawFollowUp.serviceId).trim(),
            }),
          ...(typeof rawFollowUp.text === "string" &&
            String(rawFollowUp.text).trim() !== "" && {
              text: String(rawFollowUp.text).trim().slice(0, 50),
            }),
          ...(fuPrice !== undefined && { price: fuPrice }),
        }
      : null;

  return {
    id,
    serviceId: serviceId || undefined,
    service: serviceId || (data.service as string) || undefined,
    type: (data.type as string) ?? null,
    durationMinMinutes,
    durationMaxMinutes,
    hasFollowUp: data.hasFollowUp === true && followUp !== null,
    followUp,
    createdAt:
      typeof data.createdAt === "string"
        ? data.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
    order: typeof data.order === "number" ? data.order : undefined,
    price: typeof data.price === "number" ? data.price : undefined,
    notes: typeof data.notes === "string" ? data.notes : undefined,
  } as PricingItem;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      siteId?: string;
      pricingItemId?: string;
      serviceName?: string;
      serviceType?: string | null;
      siteServiceId?: string | null;
    };
    const siteId = body?.siteId;
    if (!siteId || typeof siteId !== "string") {
      return NextResponse.json({ ok: false, message: "missing siteId" }, { status: 400 });
    }

    const db = getAdminDb();
    const siteSnap = await db.collection("sites").doc(siteId).get();
    if (!siteSnap.exists) {
      return NextResponse.json({ ok: false, message: "site not found" }, { status: 404 });
    }

    const raw = siteSnap.data()?.services;
    const services: SiteService[] = Array.isArray(raw)
      ? raw.map((s: Record<string, unknown>) => ({
          id: String(s.id ?? ""),
          name: String(s.name ?? ""),
          enabled: s.enabled !== false,
          ...(typeof s.displayName === "string" ? { displayName: s.displayName } : {}),
        }))
      : [];

    const pricingSnap = await db.collection("sites").doc(siteId).collection("pricingItems").get();
    const pricingItems: PricingItem[] = pricingSnap.docs.map((d) =>
      mapPricingDoc(d.id, d.data() as Record<string, unknown>)
    );

    const resolved = resolveRepeatSelectionAdmin(services, pricingItems, {
      pricingItemId: String(body.pricingItemId || "").trim(),
      serviceName: String(body.serviceName || "").trim(),
      serviceType:
        body.serviceType != null && String(body.serviceType).trim() !== ""
          ? String(body.serviceType).trim()
          : null,
      siteServiceId:
        body.siteServiceId != null && String(body.siteServiceId).trim() !== ""
          ? String(body.siteServiceId).trim()
          : null,
    });

    if (!resolved) {
      console.warn("[resolve-repeat-selection] no_match", {
        siteId,
        servicesCount: services.length,
        pricingCount: pricingItems.length,
        pidLen: String(body.pricingItemId || "").length,
        hasSn: !!String(body.serviceName || "").trim(),
        hasSt: !!String(body.serviceType || "").trim(),
      });
      return NextResponse.json(
        {
          ok: false,
          message: "no_match",
          userMessage: REPEAT_SERVICE_NO_LONGER_AVAILABLE,
        },
        { status: 200 }
      );
    }

    const { service, pricingItem } = resolved;
    return NextResponse.json({
      ok: true,
      service: {
        id: service.id,
        name: service.name,
        enabled: service.enabled !== false,
        displayName: (service as { displayName?: string }).displayName,
      },
      pricingItem,
    });
  } catch (e) {
    console.error("[resolve-repeat-selection]", e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
