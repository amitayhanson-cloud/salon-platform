/**
 * Normalize inbound message body and detect YES/NO/selection for booking confirmation.
 * Hebrew + English. Normalize: trim, lowercase, collapse spaces.
 */

const raw = (body: string): string => (body ?? "").trim();
const msg = (body: string): string => raw(body).toLowerCase();

/** Normalize for matching: collapse spaces, trim, lowercase */
function normalizeForMatch(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/[.,!?\s]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Hebrew YES phrases (normalized: no punctuation for matching) */
const YES_PHRASES = new Set([
  "yes",
  "y",
  "כן",
  "כן.",
  "כן!",
  "כן אגיע",
  "כן, אגיע",
  "אני מגיע",
  "אגיע",
  "כן מגיע",
  "כן אני מגיע",
  "כן אני אגיע",
  "כן אני מגיעה",
  "אני מגיעה",
  "מגיע",
  "מגיעה",
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
  "לא אגיע",
  "אני לא מגיע",
  "אני לא אגיע",
  "לא מגיע",
  "לא אני לא מגיע",
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

export type InboundIntent = "yes" | "no" | null;

/**
 * Normalize inbound text and detect intent or numeric selection.
 * - Trim, lowercase, collapse spaces.
 * - If body is only digits -> selection (1-based index).
 * - Else if matches YES phrases -> intent "yes".
 * - Else if matches NO phrases -> intent "no".
 * - Else -> intent null, selection null.
 */
export function normalizeInbound(body: string): {
  normalized: string;
  intent: InboundIntent;
  selection: number | null;
} {
  const rawStr = (body ?? "").trim();
  const normalized = rawStr.replace(/\s+/g, " ").toLowerCase().trim();
  if (/^\d+$/.test(normalized)) {
    const n = parseInt(normalized, 10);
    return { normalized, intent: null, selection: n };
  }
  const m = normalizeForMatch(normalized);
  if (YES_PHRASES.has(m)) return { normalized: m, intent: "yes", selection: null };
  if (m.includes("כן") && (m.includes("אגיע") || m.includes("מגיע")))
    return { normalized: m, intent: "yes", selection: null };
  if (NO_PHRASES.has(m)) return { normalized: m, intent: "no", selection: null };
  if (
    m.includes("לא") &&
    (m.includes("בסוף") || m.includes("אוכל") || m.includes("מגיע") || m.includes("יכול"))
  )
    return { normalized: m, intent: "no", selection: null };
  return { normalized: m, intent: null, selection: null };
}
