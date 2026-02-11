/**
 * Normalize inbound message body and detect YES/NO for booking confirmation.
 * Hebrew + English. Normalize: trim, lowercase.
 * Treat as YES/NO only on exact or allowed phrase matches.
 */

const raw = (body: string): string => (body ?? "").trim();
const msg = (body: string): string => raw(body).toLowerCase();

/** Hebrew YES phrases (normalized: no punctuation for matching) */
const YES_PHRASES = new Set([
  "yes",
  "y",
  "כן",
  "כן.",
  "כן!",
  "כן אני מגיע",
  "כן אני מגיעה",
  "אני מגיע",
  "אני מגיעה",
  "מגיע",
  "מגיעה",
  "אגיע",
  "אני בא",
  "אני באה",
  "מאשר",
  "מאשרת",
]);

/** Hebrew NO phrases */
const NO_PHRASES = new Set([
  "no",
  "n",
  "לא",
  "לא.",
  "לא!",
  "לא מגיע",
  "לא מגיעה",
  "לא יכול",
  "לא יכולה",
  "לא אוכל",
  "לא אוכל להגיע",
  "בטל",
  "ביטול",
  "מבוטל",
  "cancel",
  "cancelled",
  "canceled",
  "מבטל",
  "מבטלת",
]);

function normalizeForMatch(s: string): string {
  return s
    .replace(/[.,!?\s]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Treat as YES if msg matches any of the allowed YES phrases (Hebrew + English). */
export function isYes(body: string): boolean {
  const m = normalizeForMatch(msg(body));
  if (YES_PHRASES.has(m)) return true;
  if (m.includes("כן") && (m.includes("אגיע") || m.includes("מגיע"))) return true;
  return false;
}

/** Treat as NO if msg matches any of the allowed NO phrases. */
export function isNo(body: string): boolean {
  const m = normalizeForMatch(msg(body));
  if (NO_PHRASES.has(m)) return true;
  if (m.includes("לא") && (m.includes("בסוף") || m.includes("אוכל") || m.includes("מגיע") || m.includes("יכול")))
    return true;
  return false;
}

export function normalizeInboundBody(body: string): string {
  return normalizeForMatch(msg(body));
}
