"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { query, where, onSnapshot } from "firebase/firestore";
import { bookingsCollection, workerDoc } from "@/lib/firestorePaths";
import { clientDocRef } from "@/lib/firestoreClientRefs";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { normalizeBooking, isBookingCancelled, type NormalizedBooking } from "@/lib/normalizeBooking";
import WorkerDayPrintView, { type PrintBookingRow } from "@/components/admin/WorkerDayPrintView";
import type { ChemicalCardPrintData } from "@/components/admin/WorkerDayPrintView";

function normalizePhone(phone: string): string {
  return phone.replace(/\s|-|\(|\)/g, "");
}

function toDate(val: Date | { toDate: () => Date } | undefined): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof (val as { toDate: () => Date }).toDate === "function") return (val as { toDate: () => Date }).toDate();
  return null;
}

export default function PrintDayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const siteId = params?.siteId as string;
  const dateKey = params?.date as string;
  const workerId = searchParams?.get("workerId");
  const printedRef = useRef(false);

  const [config, setConfig] = useState<{ salonName: string } | null>(null);
  const [worker, setWorker] = useState<{ id: string; name: string } | null>(null);
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [chemicalCardsMap, setChemicalCardsMap] = useState<Record<string, ChemicalCardPrintData | null>>({});
  const [chemicalCardsReady, setChemicalCardsReady] = useState(false);

  const validWorker = workerId && workerId !== "all";

  // Subscribe to site config
  useEffect(() => {
    if (!siteId) return;
    return subscribeSiteConfig(
      siteId,
      (cfg) => setConfig(cfg ? { salonName: cfg.salonName } : null),
      (e) => console.error("[PrintDay] config error", e)
    );
  }, [siteId]);

  // Load worker by id
  useEffect(() => {
    if (!siteId || !validWorker) {
      setWorker(null);
      return;
    }
    let cancelled = false;
    getDoc(workerDoc(siteId, workerId!)).then((snap) => {
      if (cancelled) return;
      if (snap.exists()) {
        const d = snap.data();
        setWorker({ id: snap.id, name: (d?.name as string) ?? "" });
      } else {
        setWorker(null);
      }
    });
    return () => { cancelled = true; };
  }, [siteId, workerId, validWorker]);

  // Subscribe to bookings for the day
  useEffect(() => {
    if (!siteId || !dateKey) return;
    const q = query(
      bookingsCollection(siteId),
      where("date", "==", dateKey)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const normalized = snapshot.docs.map((d) =>
        normalizeBooking(d as { id: string; data: () => Record<string, unknown> })
      );
      const forDay = normalized.filter((b) => b.dateStr === dateKey);
      const notCancelled = forDay.filter((b) => !isBookingCancelled(b));
      setBookings(notCancelled);
    }, (err) => console.error("[PrintDay] bookings error", err));
    return () => unsubscribe();
  }, [siteId, dateKey]);

  const bookingsForWorker: PrintBookingRow[] = useMemo(() => {
    if (!validWorker || !workerId) return [];
    const filtered = bookings.filter((b) => b.workerId === workerId);
    return filtered
      .map((b) => {
        const startAt = toDate((b.start ?? b.startAt) as Date | { toDate: () => Date } | undefined);
        const endAt = toDate((b.end ?? b.endAt) as Date | { toDate: () => Date } | undefined);
        if (!startAt || !endAt) return null;
        const customerName = (b as { customerName?: string }).customerName ?? "";
        const serviceName = (b as { serviceName?: string }).serviceName ?? "";
        const note = (b as { note?: string | null }).note ?? null;
        const clientId = (b as { clientId?: string }).clientId;
        const customerPhone = (b as { customerPhone?: string }).customerPhone ?? "";
        const clientKey = (clientId && clientId.trim()) ? normalizePhone(clientId) : normalizePhone(customerPhone);
        return {
          startAt,
          endAt,
          customerName,
          serviceName,
          phase: b.phase,
          note,
          clientKey: clientKey || "",
        };
      })
      .filter((r): r is PrintBookingRow => r != null)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }, [bookings, workerId, validWorker]);

  const uniqueClientKeys = useMemo(() => {
    const keys = [...new Set(bookingsForWorker.map((r) => r.clientKey).filter(Boolean))];
    return keys;
  }, [bookingsForWorker]);

  useEffect(() => {
    if (!siteId || uniqueClientKeys.length === 0) {
      setChemicalCardsMap({});
      setChemicalCardsReady(true);
      return;
    }
    setChemicalCardsReady(false);
    let cancelled = false;
    Promise.all(
      uniqueClientKeys.map(async (key) => {
        const snap = await getDoc(clientDocRef(siteId, key));
        if (cancelled) return { key, card: null as ChemicalCardPrintData | null };
        const data = snap.exists() ? snap.data() : null;
        const chemicalCard = data?.chemicalCard;
        if (!chemicalCard || typeof chemicalCard !== "object") return { key, card: null };
        const colors = (chemicalCard.colors || []).map((c: { colorNumber?: string; amount?: string; notes?: string }) => ({
          colorNumber: c.colorNumber,
          amount: c.amount,
          notes: c.notes,
        }));
        const oxygen = (chemicalCard.oxygen || []).map((o: { percentage?: string; amount?: string; notes?: string }) => ({
          percentage: o.percentage,
          amount: o.amount,
          notes: o.notes,
        }));
        return { key, card: { colors, oxygen } as ChemicalCardPrintData };
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, ChemicalCardPrintData | null> = {};
      results.forEach(({ key, card }) => { map[key] = card; });
      setChemicalCardsMap(map);
      setChemicalCardsReady(true);
    }).catch((err) => {
      if (!cancelled) {
        console.error("[PrintDay] chemical cards fetch error", err);
        setChemicalCardsReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [siteId, uniqueClientKeys]);

  const ready = config != null && worker != null && validWorker && chemicalCardsReady;

  // Auto-print when data is ready (once)
  useEffect(() => {
    if (!ready || printedRef.current) return;
    printedRef.current = true;
    const timeoutId = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timeoutId);
  }, [ready]);

  if (!validWorker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-md text-center">
          <p className="text-slate-700 font-medium">בחר מטפל להדפסה</p>
          <p className="text-sm text-slate-500 mt-2">
            חזור ללוח היומי ובחר מטפל מהסינון לפני ההדפסה.
          </p>
        </div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-md text-center">
          <p className="text-slate-700 font-medium">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <WorkerDayPrintView
      siteName={config?.salonName ?? "לוח זמנים"}
      dayISO={dateKey}
      worker={worker}
      bookingsForWorkerDay={bookingsForWorker}
      chemicalCardsMap={chemicalCardsMap}
    />
  );
}
