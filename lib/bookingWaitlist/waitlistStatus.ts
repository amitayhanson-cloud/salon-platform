/**
 * Waitlist entry statuses. Legacy `active` / `notified` remain readable everywhere queries run.
 */

export const WAITLIST_WAITING_STATUSES = ["waiting", "active"] as const;
export type WaitlistWaitingStatus = (typeof WAITLIST_WAITING_STATUSES)[number];

export const WAITLIST_PENDING_OFFER_STATUSES = ["pending_offer", "notified"] as const;
export type WaitlistPendingOfferStatus = (typeof WAITLIST_PENDING_OFFER_STATUSES)[number];

export function isWaitlistWaitingStatus(s: string | undefined | null): boolean {
  return s != null && (WAITLIST_WAITING_STATUSES as readonly string[]).includes(s);
}

export function isWaitlistPendingOfferStatus(s: string | undefined | null): boolean {
  return s != null && (WAITLIST_PENDING_OFFER_STATUSES as readonly string[]).includes(s);
}
