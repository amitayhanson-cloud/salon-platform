"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { query, where, orderBy, onSnapshot } from "firebase/firestore";
import { bookingsCollection, workerDoc, workersCollection } from "@/lib/firestorePaths";
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
  const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [chemicalCardsMap, setChemicalCardsMap] = useState<Record<string, ChemicalCardPrintData | null>>({});
  const [chemicalCardsReady, setChemicalCardsReady] = useState(false);
  const [workersLoaded, setWorkersLoaded] = useState(false);

  const validSingleWorker = workerId && workerId !== "all";
  const validAllWorkers = !workerId || workerId === "all";

  // Subscribe to site config
  useEffect(() => {
    if (!siteId) return;
    return subscribeSiteConfig(
      siteId,
      (cfg) => setConfig(cfg ? { salonName: cfg.salonName } : null),
      (e) => console.error("[PrintDay] config error", e)
    );
  }, [siteId]);

  // Load single worker by id
  useEffect(() => {
    if (!siteId || !validSingleWorker) {
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
  }, [siteId, workerId, validSingleWorker]);

  // Load all workers (for "all workers" print)
  useEffect(() => {
    if (!siteId || !validAllWorkers) {
      setWorkers([]);
      setWorkersLoaded(false);
      return;
    }
    const q = query(workersCollection(siteId), orderBy("name", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWorkers(
        snapshot.docs.map((d) => {
          const data = d.data();
          return { id: d.id, name: (data?.name as string) ?? "" };
        })
      );
      setWorkersLoaded(true);
    }, (err) => console.error("[PrintDay] workers error", err));
    return () => unsubscribe();
  }, [siteId, validAllWorkers]);

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
    if (!validSingleWorker || !workerId) return [];
    const filtered = bookings.filter((b) => b.workerId === workerId);
    const rows: PrintBookingRow[] = [];
    for (const b of filtered) {
      const startAt = toDate((b.start ?? b.startAt) as Date | { toDate: () => Date } | undefined);
      const endAt = toDate((b.end ?? b.endAt) as Date | { toDate: () => Date } | undefined);
      if (!startAt || !endAt) continue;
      const customerName = (b as { customerName?: string }).customerName ?? "";
      const serviceName = (b as { serviceName?: string }).serviceName ?? "";
      const serviceType = (b as { serviceType?: string }).serviceType ?? "";
      const note = (b as { note?: string | null }).note ?? null;
      const clientId = (b as { clientId?: string }).clientId;
      const customerPhone = (b as { customerPhone?: string }).customerPhone ?? "";
      const clientKey = (clientId && clientId.trim()) ? normalizePhone(clientId) : normalizePhone(customerPhone);
      rows.push({
        startAt,
        endAt,
        customerName,
        serviceName,
        serviceType: serviceType || undefined,
        phase: b.phase,
        note,
        clientKey: clientKey || "",
      });
    }
    return rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }, [bookings, workerId, validSingleWorker]);

  /** For "all workers" mode: each worker's bookings. */
  const bookingsPerWorker = useMemo(() => {
    if (!validAllWorkers || workers.length === 0) return [];
    return workers.map((w) => {
      const filtered = bookings.filter((b) => b.workerId === w.id);
      const rows: PrintBookingRow[] = [];
      for (const b of filtered) {
        const startAt = toDate((b.start ?? b.startAt) as Date | { toDate: () => Date } | undefined);
        const endAt = toDate((b.end ?? b.endAt) as Date | { toDate: () => Date } | undefined);
        if (!startAt || !endAt) continue;
        const customerName = (b as { customerName?: string }).customerName ?? "";
        const serviceName = (b as { serviceName?: string }).serviceName ?? "";
        const serviceType = (b as { serviceType?: string }).serviceType ?? "";
        const note = (b as { note?: string | null }).note ?? null;
        const clientId = (b as { clientId?: string }).clientId;
        const customerPhone = (b as { customerPhone?: string }).customerPhone ?? "";
        const clientKey = (clientId && clientId.trim()) ? normalizePhone(clientId) : normalizePhone(customerPhone);
        rows.push({
          startAt,
          endAt,
          customerName,
          serviceName,
          serviceType: serviceType || undefined,
          phase: b.phase,
          note,
          clientKey: clientKey || "",
        });
      }
      rows.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
      return { worker: w, rows };
    });
  }, [bookings, workers, validAllWorkers]);

  const uniqueClientKeys = useMemo(() => {
    if (validAllWorkers) {
      const keys = new Set<string>();
      bookingsPerWorker.forEach(({ rows }) => rows.forEach((r) => r.clientKey && keys.add(r.clientKey)));
      return [...keys];
    }
    return [...new Set(bookingsForWorker.map((r) => r.clientKey).filter(Boolean))];
  }, [validAllWorkers, bookingsForWorker, bookingsPerWorker]);

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

  const ready =
    config != null &&
    chemicalCardsReady &&
    (validSingleWorker ? worker != null : validAllWorkers && workersLoaded);

  // Auto-print when data is ready (once)
  useEffect(() => {
    if (!ready || printedRef.current) return;
    printedRef.current = true;
    const timeoutId = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timeoutId);
  }, [ready]);

  // All workers: render one section per worker
  if (validAllWorkers) {
    return (
      <div className="worker-day-print-root" dir="rtl" style={{ paddingBottom: "2rem" }}>
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            .worker-day-print-root .print-section { break-inside: avoid; page-break-inside: avoid; }
          }
        ` }} />
        {!workersLoaded ? (
          <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
            <p className="text-slate-700 font-medium">טוען...</p>
          </div>
        ) : bookingsPerWorker.length === 0 ? (
          <div className="p-8 text-center text-slate-600">אין עובדים או תורים ליום זה.</div>
        ) : (
          bookingsPerWorker.map(({ worker: w, rows }) => (
            <div key={w.id} className="print-section">
              <WorkerDayPrintView
                siteName={config?.salonName ?? "לוח זמנים"}
                dayISO={dateKey}
                worker={w}
                bookingsForWorkerDay={rows}
                chemicalCardsMap={chemicalCardsMap}
              />
            </div>
          ))
        )}
      </div>
    );
  }

  if (!validSingleWorker) {
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
