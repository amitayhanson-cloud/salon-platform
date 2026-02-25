import type { PricingItem } from "@/types/pricingItem";

/**
 * Resolve followup display suffix from pricing (e.g. "קרטין") for phase-2 calendar/print label.
 * Display-only: used to show "החלקה - קרטין" when the pricing item has followUp.text set.
 */
export function getFollowUpDisplaySuffix(
  serviceName: string,
  serviceId: string | null | undefined,
  items: PricingItem[]
): string | null {
  const name = (serviceName ?? "").trim();
  const id = (serviceId ?? "").trim();
  if (!name) return null;
  for (const item of items) {
    const fu = item.hasFollowUp ? item.followUp : null;
    if (!fu?.name?.trim() || !fu?.text?.trim()) continue;
    const match =
      (id && fu.serviceId === id) ||
      fu.name.trim() === name ||
      fu.name.trim().toLowerCase() === name.toLowerCase();
    if (match) return fu.text.trim();
  }
  return null;
}
