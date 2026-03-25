/**
 * Shared phone normalization and booking–customer matching for public booking APIs
 * (last visit, active visit, customer-initiated cancel).
 */

export function phoneVariants(raw: string): string[] {
  const d = String(raw).replace(/\D/g, "");
  if (!d || d.length < 9) return [];
  const v = new Set<string>([d]);
  if (d.startsWith("0")) v.add("972" + d.slice(1));
  if (d.startsWith("972") && d.length > 3) v.add("0" + d.slice(3));
  return [...v];
}

export function isCancelledBookingStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s === "cancelled" ||
    s === "canceled" ||
    s === "cancelled_by_salon" ||
    s === "no_show"
  );
}

/** True if any of customerPhone / phone / clientId / customerPhoneE164 matches a variant (digits-only). */
export function bookingDocMatchesPhoneVariants(
  data: Record<string, unknown>,
  variants: string[]
): boolean {
  if (variants.length === 0) return false;
  const norm = (x: unknown) => String(x ?? "").replace(/\D/g, "");
  const fields = [
    norm(data.customerPhone),
    norm(data.phone),
    norm(data.clientId),
    norm(data.customerPhoneE164),
  ].filter((f) => f.length > 0);
  for (const f of fields) {
    if (variants.includes(f)) return true;
    if (f.startsWith("972") && variants.includes("0" + f.slice(3))) return true;
    if (f.startsWith("0") && f.length > 1 && variants.includes("972" + f.slice(1))) return true;
  }
  return false;
}
