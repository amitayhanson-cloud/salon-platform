import { NextResponse } from "next/server";
import {
  BROADCAST_AUTOMATED_STATUSES,
  MAX_BROADCAST_CLIENT_PICKS,
  type BroadcastAutomatedStatus,
  type BroadcastRecipientFilters,
  broadcastFiltersAreEmpty,
} from "@/lib/whatsapp/broadcastConstants";

export function parseBroadcastFiltersFromBody(body: unknown): BroadcastRecipientFilters | NextResponse {
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawStatuses = o.statuses;
  const rawTags = o.tagIds;
  const statuses: BroadcastAutomatedStatus[] = [];
  if (Array.isArray(rawStatuses)) {
    for (const s of rawStatuses) {
      if (typeof s === "string" && (BROADCAST_AUTOMATED_STATUSES as readonly string[]).includes(s)) {
        statuses.push(s as BroadcastAutomatedStatus);
      }
    }
  }
  const tagIds: string[] = [];
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (typeof t === "string" && t.trim()) tagIds.push(t.trim());
    }
  }
  const rawClientIds = o.clientIds;
  const clientIds: string[] = [];
  if (Array.isArray(rawClientIds)) {
    for (const c of rawClientIds) {
      if (typeof c === "string" && c.trim()) clientIds.push(c.trim());
    }
  }
  if (clientIds.length > MAX_BROADCAST_CLIENT_PICKS) {
    return NextResponse.json(
      { ok: false, error: `ניתן לבחור עד ${MAX_BROADCAST_CLIENT_PICKS} לקוחות בבת אחת` },
      { status: 400 }
    );
  }
  if (broadcastFiltersAreEmpty({ statuses, tagIds, clientIds })) {
    return NextResponse.json(
      { ok: false, error: "נדרש לבחור לפחות אחד: סטטוס אוטומטי, תג ידני, או לקוחות ספציפיים" },
      { status: 400 }
    );
  }
  return { statuses, tagIds, clientIds };
}
