/**
 * Lookup-only helper: find booking IDs that belong to the same "booking action" (main + follow-ups).
 * Used ONLY for status/tag propagation. NOT used in scheduling, creation, or availability.
 * Uses existing fields: visitGroupId/bookingGroupId (preferred) or parentBookingId chain.
 */

import { getAdminDb } from "@/lib/firebaseAdmin";

/** Cap to avoid accidental fan-out. */
export const MAX_RELATED_BOOKINGS = 20;

export type RelatedBookingsResult = {
  bookingIds: string[];
  groupKey: string | null;
  /** Canonical root booking id for this group (for logging / single source of truth). */
  rootId: string;
};

export type ResolveBookingGroupResult = {
  rootId: string;
  memberIds: string[];
};

/**
 * Returns the list of booking IDs that should receive the same status/tag as the given booking.
 * - If the booking has visitGroupId or bookingGroupId: all bookings in the same site with that same value (up to cap).
 * - Else if the booking has parentBookingId: root = parent, related = [root] + all with parentBookingId === root.
 * - Else: just [bookingId].
 * Does not modify any data. Read-only.
 */
export async function getRelatedBookingIds(
  siteId: string,
  bookingId: string
): Promise<RelatedBookingsResult> {
  const db = getAdminDb();
  const ref = db.collection("sites").doc(siteId).collection("bookings").doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { bookingIds: [bookingId], groupKey: null, rootId: bookingId };
  }
  const data = snap.data()!;

  const groupKey =
    (data.visitGroupId as string)?.trim() ||
    (data.bookingGroupId as string)?.trim() ||
    null;

  if (groupKey) {
    const byVisit = await db
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("visitGroupId", "==", groupKey)
      .limit(MAX_RELATED_BOOKINGS + 1)
      .get();
    const byBooking = await db
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("bookingGroupId", "==", groupKey)
      .limit(MAX_RELATED_BOOKINGS + 1)
      .get();
    const idSet = new Set<string>();
    for (const d of byVisit.docs) idSet.add(d.id);
    for (const d of byBooking.docs) idSet.add(d.id);
    // Root is the doc with no parentBookingId (follow-ups point to root)
    let rootIdFromGroup: string | null = null;
    for (const d of byVisit.docs) {
      if (!(d.data().parentBookingId as string)?.trim()) {
        rootIdFromGroup = d.id;
        break;
      }
    }
    if (!rootIdFromGroup) {
      for (const d of byBooking.docs) {
        if (!(d.data().parentBookingId as string)?.trim()) {
          rootIdFromGroup = d.id;
          break;
        }
      }
    }
    if (!rootIdFromGroup) rootIdFromGroup = Array.from(idSet)[0] ?? bookingId;
    // Include follow-ups that only have parentBookingId (e.g. admin phase-2 docs without visitGroupId)
    const byParent = await db
      .collection("sites")
      .doc(siteId)
      .collection("bookings")
      .where("parentBookingId", "==", rootIdFromGroup)
      .limit(MAX_RELATED_BOOKINGS)
      .get();
    for (const d of byParent.docs) idSet.add(d.id);
    if (!idSet.has(bookingId)) idSet.add(bookingId);
    const allIds = Array.from(idSet);
    if (allIds.length === 0) allIds.push(bookingId);
    const bookingIds = allIds.slice(0, MAX_RELATED_BOOKINGS);
    const rootId = rootIdFromGroup;
    return {
      bookingIds,
      groupKey,
      rootId,
    };
  }

  const parentId = (data.parentBookingId as string)?.trim() || null;
  const rootId = parentId || bookingId;

  const out: string[] = [rootId];
  const withParent = await db
    .collection("sites")
    .doc(siteId)
    .collection("bookings")
    .where("parentBookingId", "==", rootId)
    .limit(MAX_RELATED_BOOKINGS)
    .get();
  for (const d of withParent.docs) {
    if (d.id !== rootId && !out.includes(d.id)) out.push(d.id);
  }
  if (!out.includes(bookingId)) out.push(bookingId);

  return {
    bookingIds: out.slice(0, MAX_RELATED_BOOKINGS),
    groupKey: rootId,
    rootId,
  };
}

/**
 * Resolves the booking group for the same "booking action" (root + follow-ups).
 * Read-only; uses only existing fields (visitGroupId/bookingGroupId/parentBookingId).
 */
export async function resolveBookingGroup(
  siteId: string,
  bookingId: string
): Promise<ResolveBookingGroupResult> {
  const { bookingIds, rootId } = await getRelatedBookingIds(siteId, bookingId);
  return { rootId, memberIds: bookingIds };
}

export type ResolveBookingGroupRefsResult = {
  siteId: string;
  rootId: string;
  rootBookingRef: string;
  memberIds: string[];
  bookingRefsInGroup: string[];
};

/**
 * Parse bookingRef and resolve full group (root + follow-ups). Same resolver as YES/NO tag sync.
 * Use for webhook logging and group-wide actions.
 */
export async function resolveBookingGroupFromRef(bookingRef: string): Promise<ResolveBookingGroupRefsResult | null> {
  const match = /^sites\/([^/]+)\/bookings\/([^/]+)$/.exec(bookingRef);
  if (!match) return null;
  const [, siteId, bookingId] = match;
  const { bookingIds, rootId } = await getRelatedBookingIds(siteId, bookingId);
  return {
    siteId,
    rootId,
    rootBookingRef: `sites/${siteId}/bookings/${rootId}`,
    memberIds: bookingIds,
    bookingRefsInGroup: bookingIds.map((id) => `sites/${siteId}/bookings/${id}`),
  };
}
