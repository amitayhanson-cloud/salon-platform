import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";

import type { BookingWaitlistEntry } from "@/types/bookingWaitlist";
import {
  buildMaxFreedSlotFromHorizonGap,
  entryWallSpanMinutesFromPrimaryStart,
  findEarliestSlottedStartForEntryInWallWindow,
  segmentWallWindowUtcMs,
  trySlideWaitlistCapacitySliceForStrictTime,
  type FreedBookingSlot,
  type WaitlistSlotMatchOptions,
} from "./matchService";

const SITE_TZ = "Asia/Jerusalem";

describe("waitlist offer slide inside freed segment", () => {
  it("finds 17:00 start when segment begins at 11:00 and user wants evening only", () => {
    const gapStart = fromZonedTime("2026-06-15T11:00:00", SITE_TZ).getTime();
    const gapEnd = fromZonedTime("2026-06-15T18:30:00", SITE_TZ).getTime();
    const window = { startMs: gapStart, endExclusiveMs: gapEnd };

    const entry = {
      timePreference: ["evening"] as BookingWaitlistEntry["timePreference"],
      primaryDurationMin: 30,
      waitMinutes: 0,
      followUpDurationMin: 0,
    };

    const salonDay = { enabled: true, start: "09:00", end: "21:00" };
    const getSalonDayForYmd = () => salonDay;
    const nowMs = fromZonedTime("2026-06-15T08:00:00", SITE_TZ).getTime();

    const slid = findEarliestSlottedStartForEntryInWallWindow(
      entry,
      window,
      SITE_TZ,
      getSalonDayForYmd,
      nowMs
    );

    expect(slid).not.toBeNull();
    expect(slid!.dateYmd).toBe("2026-06-15");
    expect(slid!.timeHHmm).toBe("17:00");
    expect(entryWallSpanMinutesFromPrimaryStart(entry)).toBe(30);
  });

  it("returns null when evening does not fit before segment ends", () => {
    const gapStart = fromZonedTime("2026-06-15T11:00:00", SITE_TZ).getTime();
    const gapEnd = fromZonedTime("2026-06-15T17:10:00", SITE_TZ).getTime();
    const window = { startMs: gapStart, endExclusiveMs: gapEnd };

    const entry = {
      timePreference: ["evening"] as BookingWaitlistEntry["timePreference"],
      primaryDurationMin: 30,
      waitMinutes: 0,
      followUpDurationMin: 0,
    };

    const salonDay = { enabled: true, start: "09:00", end: "21:00" };
    const nowMs = fromZonedTime("2026-06-15T08:00:00", SITE_TZ).getTime();

    const slid = findEarliestSlottedStartForEntryInWallWindow(
      entry,
      window,
      SITE_TZ,
      () => salonDay,
      nowMs
    );

    expect(slid).toBeNull();
  });

  it("segmentWallWindowUtcMs matches buildMaxFreedSlotFromHorizonGap duration", () => {
    const gapStart = fromZonedTime("2026-06-15T11:00:00", SITE_TZ).getTime();
    const gapEnd = fromZonedTime("2026-06-15T18:30:00", SITE_TZ).getTime();
    const gap = { gapStartMs: gapStart, gapEndExclusiveMs: gapEnd };

    const base: FreedBookingSlot = {
      dateYmd: "2026-06-15",
      timeHHmm: "11:00",
      workerId: "w1",
      workerName: null,
      serviceTypeId: null,
      serviceId: null,
      serviceName: "Cut",
      durationMin: 60,
      primaryDurationMin: 60,
      waitMinutes: 0,
      followUpDurationMin: 0,
      followUpWorkerId: null,
      followUpWorkerName: null,
      followUpServiceName: null,
    };

    const maxSlot = buildMaxFreedSlotFromHorizonGap(gap, SITE_TZ, base);
    expect(maxSlot).not.toBeNull();
    const win = segmentWallWindowUtcMs(maxSlot!, SITE_TZ);
    expect(win).not.toBeNull();
    expect(win!.startMs).toBe(gapStart);
    expect(win!.endExclusiveMs).toBe(gapEnd);
  });

  it("trySlideWaitlistCapacitySliceForStrictTime returns slid slice when only bucket mismatches at segment start", () => {
    const slice: FreedBookingSlot = {
      dateYmd: "2026-06-15",
      timeHHmm: "11:00",
      workerId: "w1",
      workerName: null,
      serviceTypeId: "t1",
      serviceId: "s1",
      serviceName: "Cut",
      durationMin: 450,
      primaryDurationMin: 450,
      waitMinutes: 0,
      followUpDurationMin: 0,
      followUpWorkerId: null,
      followUpWorkerName: null,
      followUpServiceName: null,
    };

    const entry: Pick<
      BookingWaitlistEntry,
      | "serviceTypeId"
      | "serviceId"
      | "serviceName"
      | "preferredDateYmd"
      | "preferredWorkerId"
      | "primaryDurationMin"
      | "waitMinutes"
      | "followUpDurationMin"
      | "timePreference"
    > = {
      serviceTypeId: "t1",
      serviceId: "s1",
      serviceName: "Cut",
      preferredDateYmd: "2026-06-15",
      preferredWorkerId: null,
      primaryDurationMin: 30,
      waitMinutes: 0,
      followUpDurationMin: 0,
      timePreference: ["evening"],
    };

    const strictOfferWall: NonNullable<WaitlistSlotMatchOptions["strictOfferWall"]> = {
      siteTz: SITE_TZ,
      salonDay: { enabled: true, start: "09:00", end: "21:00" },
      nowMs: fromZonedTime("2026-06-15T08:00:00", SITE_TZ).getTime(),
    };

    const matchOpts: WaitlistSlotMatchOptions = {
      matchAnyService: false,
      horizonBuckets: new Set(["morning", "afternoon", "evening"]),
      timeBucket: "morning",
      strictOfferWall,
    };

    const getSalonDayForYmd = () => ({ enabled: true, start: "09:00", end: "21:00" });

    const slid = trySlideWaitlistCapacitySliceForStrictTime(
      entry,
      slice,
      matchOpts,
      SITE_TZ,
      getSalonDayForYmd,
      strictOfferWall.nowMs
    );

    expect(slid).not.toBeNull();
    expect(slid!.timeHHmm).toBe("17:00");
    expect(slid!.dateYmd).toBe("2026-06-15");
  });
});
