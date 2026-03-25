"use strict";
/** Minimal copy of lib/expiredCleanupUtils for Cloud Functions bundle. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDateYMDInTimezone = getDateYMDInTimezone;
exports.zonedDayRangeEpochMs = zonedDayRangeEpochMs;
function getDateYMDInTimezone(date, tz) {
    try {
        return date.toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
    }
    catch {
        return date.toISOString().slice(0, 10);
    }
}
function ymdAtEpochMs(ms, tz) {
    return new Date(ms).toLocaleString("en-CA", { timeZone: tz }).slice(0, 10);
}
function zonedDayRangeEpochMs(ymd, tz) {
    const [y, mo, d] = ymd.split("-").map(Number);
    let lo = Date.UTC(y, mo - 1, d) - 48 * 3600_000;
    let hi = Date.UTC(y, mo - 1, d) + 48 * 3600_000;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (ymdAtEpochMs(mid, tz) < ymd)
            lo = mid + 1;
        else
            hi = mid;
    }
    const start = lo;
    let lo2 = start + 1;
    let hi2 = start + 32 * 3600_000;
    while (lo2 < hi2) {
        const mid = Math.floor((lo2 + hi2) / 2);
        if (ymdAtEpochMs(mid, tz) === ymd)
            lo2 = mid + 1;
        else
            hi2 = mid;
    }
    return { start, endExclusive: hi2 };
}
