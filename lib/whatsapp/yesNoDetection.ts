/**
 * Normalize inbound message body and detect YES/NO for booking confirmation.
 * Hebrew + English. Normalize: trim, lowercase, remove surrounding punctuation.
 * Matching is flexible (includes() where reasonable) to accept natural replies.
 */

function normalizeBody(body: string): string {
  let s = (body ?? "").trim().toLowerCase();
  s = s.replace(/^[.,!?\s]+|[.,!?\s]+$/g, "");
  s = s.replace(/[,.\s]+/g, " ").trim();
  return s;
}

/** Hebrew YES: כן, כן אגיע, כן אגיע., אגיע, מאשר, מאשרת. English: yes, y */
export function isYes(body: string): boolean {
  const n = normalizeBody(body);
  if (n === "כן" || n === "yes" || n === "y" || n === "מאשר" || n === "מאשרת" || n === "אגיע")
    return true;
  if (n.includes("כן") && n.includes("אגיע")) return true;
  return false;
}

/** Hebrew NO: לא, לא אוכל להגיע, לא בסוף, לא מגיע, מבטל, מבטלת. English: no, n */
export function isNo(body: string): boolean {
  const n = normalizeBody(body);
  if (n === "לא" || n === "no" || n === "n" || n === "מבטל" || n === "מבטלת") return true;
  if (n.includes("לא") && (n.includes("בסוף") || n.includes("אוכל") || n.includes("מגיע")))
    return true;
  return false;
}

export function normalizeInboundBody(body: string): string {
  return normalizeBody(body);
}
