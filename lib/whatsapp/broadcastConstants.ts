/**
 * Client + server safe: broadcast filter types and limits (no firebase-admin).
 */

export const BROADCAST_AUTOMATED_STATUSES = ["new", "active", "sleeping"] as const;
export type BroadcastAutomatedStatus = (typeof BROADCAST_AUTOMATED_STATUSES)[number];

export type BroadcastRecipientFilters = {
  /** If non-empty, client must have currentStatus in this set. */
  statuses: BroadcastAutomatedStatus[];
  /** If non-empty, client must have at least one of these manual tag ids. */
  tagIds: string[];
  /**
   * Explicit recipients by Firestore client document id (= phone).
   * Union with segment filters: final set = selected individuals ∪ segment matches (deduped by E.164).
   */
  clientIds: string[];
};

export const MAX_BROADCAST_RECIPIENTS = 500;
/** Max explicit client picks per request (same cap as send batch). */
export const MAX_BROADCAST_CLIENT_PICKS = MAX_BROADCAST_RECIPIENTS;

/** Free-form `{custom_text}` segment in the fixed broadcast template (not full message length). */
export const MAX_BROADCAST_CUSTOM_TEXT_LEN = 800;

export function broadcastFiltersAreEmpty(f: BroadcastRecipientFilters): boolean {
  return f.statuses.length === 0 && f.tagIds.length === 0 && f.clientIds.length === 0;
}
