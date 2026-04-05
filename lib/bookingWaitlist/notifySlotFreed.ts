/**
 * @deprecated Import {@link triggerWaitlistMatchForFreedSlot} from `./triggerWaitlistMatch` — kept for stable call sites.
 */

import type { FreedBookingSlot } from "./matchService";
import {
  triggerWaitlistMatchForFreedSlot,
  type TriggerWaitlistMatchOptions,
  WAITLIST_OFFER_TTL_MS,
} from "./triggerWaitlistMatch";

export { WAITLIST_OFFER_TTL_MS };

export type NotifyWaitlistOptions = Pick<TriggerWaitlistMatchOptions, "skipEntryIds">;

export async function notifyBookingWaitlistFromFreedSlot(
  siteId: string,
  slot: FreedBookingSlot,
  options?: NotifyWaitlistOptions
): Promise<{ notified: boolean; entryId?: string }> {
  const r = await triggerWaitlistMatchForFreedSlot(siteId, slot, {
    skipEntryIds: options?.skipEntryIds,
  });
  return { notified: r.notified, entryId: r.entryId };
}
