/**
 * Server-only: resolve שירות + מחירון from last-booking fields (Admin DB snapshot).
 */
import type { PricingItem } from "@/types/pricingItem";
import type { SiteService } from "@/types/siteConfig";

function enabled(s: SiteService): boolean {
  return s.enabled !== false;
}

function pricingItemsForService(s: SiteService, pricingItems: PricingItem[]): PricingItem[] {
  const idStr = String(s.id ?? "").trim();
  const nameStr = (s.name || "").trim();
  const disp = String((s as { displayName?: string }).displayName ?? "").trim();
  return pricingItems.filter((p) => {
    const psid = String(p.serviceId ?? p.service ?? "").trim();
    if (!psid) return false;
    return psid === idStr || psid === nameStr || (disp !== "" && psid === disp);
  });
}

function findServiceForPricingItem(
  p: PricingItem,
  services: SiteService[]
): SiteService | undefined {
  const psid = String(p.serviceId ?? p.service ?? "").trim();
  if (!psid) return undefined;
  let x = services.find((s) => String(s.id ?? "").trim() === psid);
  if (x) return x;
  x = services.find((s) => (s.name || "").trim() === psid);
  if (x) return x;
  return services.find((s) => {
    const d = String((s as { displayName?: string }).displayName ?? "").trim();
    return d !== "" && d === psid;
  });
}

function findServiceOwningItem(
  p: PricingItem,
  services: SiteService[],
  pricingItems: PricingItem[]
): SiteService | undefined {
  const direct = findServiceForPricingItem(p, services);
  if (direct) return direct;
  for (const s of services) {
    if (pricingItemsForService(s, pricingItems).some((q) => q.id === p.id)) return s;
  }
  return undefined;
}

function typeMatchesItem(p: PricingItem, needle: string): boolean {
  const st = needle.trim();
  if (!st) return false;
  const t = String(p.type ?? "").trim();
  const notes = String(p.notes ?? "").trim();
  if (t === st || t.includes(st) || st.includes(t)) return true;
  if (notes && (notes.includes(st) || st.includes(notes))) return true;
  return false;
}

function scoreServiceNameMatch(svc: SiteService, sn: string): number {
  if (!sn) return 0;
  const name = (svc.name || "").trim();
  const id = String(svc.id ?? "").trim();
  const disp = String((svc as { displayName?: string }).displayName ?? "").trim();
  if (name === sn || id === sn) return 100;
  if (disp === sn) return 95;
  if (name.length >= 2 && (name.includes(sn) || sn.includes(name))) return 88;
  if (disp.length >= 2 && (disp.includes(sn) || sn.includes(disp))) return 82;
  return 0;
}

export function resolveRepeatSelectionAdmin(
  services: SiteService[],
  pricingItems: PricingItem[],
  input: {
    pricingItemId: string;
    serviceName: string;
    serviceType: string | null;
    siteServiceId: string | null;
  }
): { service: SiteService; pricingItem: PricingItem } | null {
  const pid = String(input.pricingItemId || "").trim();
  const sn = String(input.serviceName || "").trim();
  const st = input.serviceType != null ? String(input.serviceType).trim() : "";

  if (pid) {
    const item = pricingItems.find((p) => String(p.id).trim() === pid);
    if (item) {
      let svc = input.siteServiceId
        ? services.find((s) => String(s.id) === String(input.siteServiceId))
        : undefined;
      svc = svc || findServiceOwningItem(item, services, pricingItems);
      if (svc) {
        return { service: svc, pricingItem: item };
      }
      const sid = String(item.serviceId ?? item.service ?? "").trim();
      if (sid) {
        return {
          service: { id: sid, name: sn || sid, enabled: true } as SiteService,
          pricingItem: item,
        };
      }
    }
  }

  const tryPair = (serviceName: string, typeLabel: string): { service: SiteService; pricingItem: PricingItem } | null => {
    const a = serviceName.trim();
    const b = typeLabel.trim();
    if (!a || !b) return null;

    if (input.siteServiceId) {
      const s = services.find((x) => String(x.id) === String(input.siteServiceId));
      if (s) {
        const items = pricingItemsForService(s, pricingItems);
        const hit =
          items.find((p) => String(p.type ?? "").trim() === b) ||
          items.find((p) => typeMatchesItem(p, b));
        if (hit) return { service: s, pricingItem: hit };
      }
    }

    /** כולל שירות מושבת — הלקוח כבר הוזמן אליו */
    for (const s of services) {
      const nm = (s.name || "").trim();
      const matchSvc =
        nm === a ||
        String(s.id) === a ||
        (a.length >= 2 && (nm.includes(a) || a.includes(nm)));
      if (!matchSvc) continue;
      const items = pricingItemsForService(s, pricingItems);
      const hit =
        items.find((p) => String(p.type ?? "").trim() === b) ||
        items.find((p) => typeMatchesItem(p, b));
      if (hit) return { service: s, pricingItem: hit };
    }

    const globalHits = pricingItems.filter(
      (p) => String(p.type ?? "").trim() === b || typeMatchesItem(p, b)
    );
    let best: { service: SiteService; pricingItem: PricingItem; sc: number } | null = null;
    for (const p of globalHits) {
      let svc = findServiceOwningItem(p, services, pricingItems);
      const sid = String(p.serviceId ?? p.service ?? "").trim();
      if (!svc && sid) {
        svc = { id: sid, name: a || sid, enabled: true } as SiteService;
      }
      if (!svc) continue;
      const sc = Math.max(scoreServiceNameMatch(svc, a), svc.name === a ? 100 : 0);
      if (!best || sc > best.sc) {
        best = { service: svc, pricingItem: p, sc };
      }
    }
    if (best && best.sc >= 75) {
      return { service: best.service, pricingItem: best.pricingItem };
    }
    if (best && globalHits.length === 1) {
      return { service: best.service, pricingItem: best.pricingItem };
    }
    return null;
  };

  const r = tryPair(sn, st);
  if (r) return r;
  if (sn && st && sn !== st) {
    const r2 = tryPair(st, sn);
    if (r2) return r2;
  }

  if (sn && !st) {
    for (const s of services) {
      if (!enabled(s)) continue;
      if (scoreServiceNameMatch(s, sn) < 75) continue;
      const items = pricingItemsForService(s, pricingItems);
      if (items.length === 1) return { service: s, pricingItem: items[0]! };
    }
  }

  if (st && !sn) {
    const hits = pricingItems.filter(
      (p) => String(p.type ?? "").trim() === st || typeMatchesItem(p, st)
    );
    if (hits.length === 1) {
      const p = hits[0]!;
      const svc = findServiceOwningItem(p, services, pricingItems);
      if (svc) return { service: svc, pricingItem: p };
      const sid = String(p.serviceId ?? p.service ?? "").trim();
      if (sid) {
        return {
          service: { id: sid, name: sid, enabled: true } as SiteService,
          pricingItem: p,
        };
      }
    }
  }

  return null;
}
