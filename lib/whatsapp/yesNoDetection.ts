/**
 * Normalize inbound message body and detect YES/NO/selection for booking confirmation.
 * Hebrew + English. Normalize: trim, lowercase, collapse spaces.
 *
 * Reminder template buttons (Meta/Twilio): match interactive labels such as `כן, אגיע` and
 * `לא, נא לבטל` via {@link normalizeForMatch} (commas stripped → `כן אגיע`, `לא נא לבטל`).
 * {@link intentFromInteractiveTemplate} reads `ButtonText` first when `Body` is empty.
 */

const raw = (body: string): string => (body ?? "").trim();
const msg = (body: string): string => raw(body).toLowerCase();

/** Strip direction marks / embedding chars so "כן, אגיע" from templates matches after normalization. */
function stripBidiAndEmbedding(s: string): string {
  return s.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "");
}

/** Normalize for matching: collapse spaces, trim, remove punctuation and slash, lowercase */
function normalizeForMatch(s: string): string {
  return stripBidiAndEmbedding(s)
    .replace(/\s+/g, " ")
    .replace(/\//g, "") // "לא מגיע/ה" -> "לא מגיעה"
    .replace(/[.,!?\s]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Hebrew YES phrases (normalized: no punctuation for matching) */
const YES_PHRASES = new Set([
  "yes",
  "y",
  "כן",
  "כן אגיע",
  "אני מגיע",
  "אגיע",
  "כן מגיע",
  "כן אני מגיע",
  "כן אני אגיע",
  "כן אני מגיעה",
  "אני מגיעה",
  "מגיע",
  "מגיעה",
  "מגיעים",
  "אני בא",
  "אני באה",
  "מאשר",
  "מאשרת",
  "אישור",
]);

/**
 * Hebrew NO phrases (keep in sync with reminder List/Message button labels, e.g. `לא, נא לבטל`).
 */
const NO_PHRASES = new Set([
  "no",
  "n",
  "לא",
  "לא אגיע",
  "אני לא מגיע",
  "אני לא אגיע",
  "לא מגיע",
  "לא אני לא מגיע",
  "לא מגיעה",
  "לא לא אגיע",
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
  /** Reminder template quick reply (Meta/Twilio) */
  "לא נא לבטל",
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
 * - Optional `buttonPayload`: Twilio quick-reply / template button value (checked before body text).
 * - If body is only digits -> selection (1-based index).
 * - Else if matches YES phrases -> intent "yes".
 * - Else if matches NO phrases -> intent "no".
 * - Else -> intent null, selection null.
 */
export function normalizeInbound(
  body: string,
  buttonPayload?: string | null
): {
  normalized: string;
  intent: InboundIntent;
  selection: number | null;
} {
  const rawPayload = (buttonPayload ?? "").trim();
  if (rawPayload) {
    const payloadNorm = normalizeForMatch(rawPayload.toLowerCase());
    if (payloadNorm === "yes" || payloadNorm === "confirm") {
      return { normalized: payloadNorm || "yes", intent: "yes", selection: null };
    }
    if (payloadNorm === "no" || payloadNorm === "cancel") {
      return { normalized: payloadNorm || "no", intent: "no", selection: null };
    }
    // Do not use payloadNorm.includes("כן"/"לא") — long payloads (e.g. echoed template text)
    // can contain those substrings and steal the opt-in booking-confirmation path.
    if (isYes(rawPayload)) {
      return { normalized: normalizeInboundBody(rawPayload), intent: "yes", selection: null };
    }
    if (isNo(rawPayload)) {
      return { normalized: normalizeInboundBody(rawPayload), intent: "no", selection: null };
    }
  }
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

/** Broadcast quick reply "הסר אותי מהרשימה" — match Body, ButtonText, or ButtonPayload. */
export function isBroadcastWaitlistOptOut(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return normalizeForMatch(msg(t)) === normalizeForMatch(msg("הסר אותי מהרשימה"));
}

/**
 * Template / list-reply buttons: Twilio often sends the label on `ButtonText` with an empty `Body`.
 * Prefer this over {@link normalizeInbound} when quick-reply labels must win (e.g. "כן, אגיע").
 */
export function intentFromInteractiveTemplate(
  body: string,
  buttonText: string,
  buttonPayload: string | null | undefined
): InboundIntent {
  for (const raw of [buttonText, body, buttonPayload ?? ""]) {
    if (!(raw ?? "").trim()) continue;
    if (isYes(raw)) return "yes";
    if (isNo(raw)) return "no";
  }
  return null;
}
