"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { getDoc } from "firebase/firestore";
import { query, where, orderBy, limit } from "firebase/firestore";
import { bookingsCollection, workerDoc, workersCollection } from "@/lib/firestorePaths";
import { onSnapshotDebug } from "@/lib/firestoreListeners";
import { clientDocRef } from "@/lib/firestoreClientRefs";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { subscribeBookingSettings } from "@/lib/firestoreBookingSettings";
import { isBusinessClosedAllDay } from "@/lib/closedDates";
import type { BookingSettings } from "@/types/bookingSettings";
import { normalizeBooking, isBookingCancelled, isBookingArchived, type NormalizedBooking } from "@/lib/normalizeBooking";
import PrintDayGridView from "@/components/admin/PrintDayGridView";
import { type PrintBookingRow } from "@/components/admin/WorkerDayPrintView";
import type { ChemicalCardPrintData } from "@/components/admin/WorkerDayPrintView";

/** Set to true to close the print tab after user finishes/cancels print (tab was opened with window.open). */
const ENABLE_CLOSE_TAB_AFTER_PRINT = false;

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
  const printRootRef = useRef<HTMLDivElement | null>(null);

  const [config, setConfig] = useState<{ salonName: string } | null>(null);
  const [worker, setWorker] = useState<{ id: string; name: string } | null>(null);
  const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [chemicalCardsMap, setChemicalCardsMap] = useState<Record<string, ChemicalCardPrintData | null>>({});
  const [chemicalCardsReady, setChemicalCardsReady] = useState(false);
  const [workersLoaded, setWorkersLoaded] = useState(false);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);

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

  // Subscribe to booking settings (for closed-date banner)
  useEffect(() => {
    if (!siteId) return;
    return subscribeBookingSettings(
      siteId,
      (s) => setBookingSettings(s),
      (e) => console.error("[PrintDay] booking settings error", e)
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
    const q = query(workersCollection(siteId), orderBy("name", "asc"), limit(100));
    const unsubscribe = onSnapshotDebug("print-workers", q, (snapshot) => {
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

  // Subscribe to bookings for the day (bounded)
  useEffect(() => {
    if (!siteId || !dateKey) return;
    const q = query(
      bookingsCollection(siteId),
      where("date", "==", dateKey),
      limit(200)
    );
    const unsubscribe = onSnapshotDebug("print-bookings", q, (snapshot) => {
      const normalized = snapshot.docs.map((d) =>
        normalizeBooking(d as { id: string; data: () => Record<string, unknown> })
      );
      const forDay = normalized.filter((b) => b.dateStr === dateKey);
      const notCancelled = forDay.filter((b) => !isBookingCancelled(b) && !isBookingArchived(b));
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
        const colors = (chemicalCard.colors || []).map((c: { colorNumber?: string; amount?: string; oxygen?: string; notes?: string }) => ({
          colorNumber: c.colorNumber,
          amount: c.amount,
          oxygen: c.oxygen,
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

  // Print route: no scroll – force html/body and app shell to non-scrolling
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("print-route-active");
    body.classList.add("print-route-active");
    const prevHtml = { overflow: html.style.overflow, height: html.style.height, minHeight: html.style.minHeight };
    const prevBody = { overflow: body.style.overflow, height: body.style.height, minHeight: body.style.minHeight };
    html.style.overflow = "visible";
    html.style.height = "auto";
    html.style.minHeight = "0";
    body.style.overflow = "visible";
    body.style.height = "auto";
    body.style.minHeight = "0";
    const appRoot = document.getElementById("__next");
    const prevRoot = appRoot ? { overflow: appRoot.style.overflow, height: appRoot.style.height, minHeight: appRoot.style.minHeight } : null;
    if (appRoot) {
      appRoot.classList.add("print-route-active");
      appRoot.style.overflow = "visible";
      appRoot.style.height = "auto";
      appRoot.style.minHeight = "0";
    }
    return () => {
      html.classList.remove("print-route-active");
      body.classList.remove("print-route-active");
      if (appRoot) appRoot.classList.remove("print-route-active");
      html.style.overflow = prevHtml.overflow;
      html.style.height = prevHtml.height;
      html.style.minHeight = prevHtml.minHeight;
      body.style.overflow = prevBody.overflow;
      body.style.height = prevBody.height;
      body.style.minHeight = prevBody.minHeight;
      if (appRoot && prevRoot) {
        appRoot.style.overflow = prevRoot.overflow;
        appRoot.style.height = prevRoot.height;
        appRoot.style.minHeight = prevRoot.minHeight;
      }
    };
  }, []);

  // Content ready = calendar is rendered (not loading/empty)
  const contentReady =
    ready &&
    ((validAllWorkers && workersLoaded && workers.length > 0) || (validSingleWorker && worker != null));

  // After layout is stable: measure, set scale to fit one A4 page, then open print dialog
  useEffect(() => {
    if (typeof window === "undefined" || !contentReady || printedRef.current) return;

    const timeoutId = setTimeout(() => {
      const root = printRootRef.current;
      if (!root || printedRef.current) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (printedRef.current) return;
          const contentHeight = root.scrollHeight;
          // A4 portrait: 297mm; 10mm top + 10mm bottom margin → 277mm printable height. At 96dpi: ~1046px.
          const printableHeightPx = 1040;
          const scale = contentHeight <= 0 ? 1 : Math.min(1, printableHeightPx / contentHeight);
          root.style.setProperty("--print-scale", String(scale));
          printedRef.current = true;
          requestAnimationFrame(() => {
            window.print();
          });
        });
      });
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [contentReady]);

  // Optional: close print tab after user finishes/cancels print
  useEffect(() => {
    if (!ENABLE_CLOSE_TAB_AFTER_PRINT || typeof window === "undefined") return;
    const onAfterPrint = () => {
      window.close();
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  const printAndScreenStyles = `
    html.print-route-active, body.print-route-active {
      height: auto !important; min-height: 0 !important; overflow: visible !important;
    }
    #__next.print-route-active { height: auto !important; min-height: 0 !important; overflow: visible !important; }
    .printRoot, .print-route-root { overflow: visible !important; height: auto !important; min-height: 0 !important; }
    .print-page-root { overflow: visible; height: auto; min-height: 0; background: #fff; }
    .print-day-grid-root { width: 100%; max-width: 190mm; }
    .print-day-grid-root, .print-day-grid-root * { box-sizing: border-box; }
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      html.print-route-active, body.print-route-active { height: auto !important; min-height: 0 !important; overflow: visible !important; }
      body * { visibility: hidden; }
      .print-route-root, .print-route-root *,
      .print-page-root, .print-page-root * { visibility: visible; }
      .print-route-root, .print-page-root {
        position: absolute !important; left: 0; top: 0; width: 100% !important;
        padding: 0; margin: 0 !important; background: white !important;
        overflow: visible !important; height: auto !important; min-height: 0 !important;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      .printRoot {
        transform: scale(var(--print-scale, 1));
        transform-origin: top center;
      }
      .print-day-grid-root, .print-day-grid-root * { break-inside: avoid; page-break-inside: avoid; }
      .print-day-grid-root .print-grid-section { break-inside: avoid; page-break-inside: avoid; }
      header, nav, .admin-header, [role="banner"], button:not(.print-keep) { display: none !important; visibility: hidden !important; }
    }
  `;

  const closedBanner =
    dateKey && bookingSettings && isBusinessClosedAllDay({ bookingSettings, date: dateKey }) ? (
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-right print:mb-2">
        <p className="text-sm font-medium text-amber-800">העסק סגור בתאריך זה</p>
      </div>
    ) : null;

  // All workers: single grid with all worker columns
  if (validAllWorkers) {
    return (
      <div ref={printRootRef} className="printRoot print-page-root" dir="rtl" style={{ paddingBottom: "2rem" }} data-print-route>
        <style dangerouslySetInnerHTML={{ __html: printAndScreenStyles }} />
        {closedBanner}
        {!workersLoaded ? (
          <div className="min-h-screen flex items-center justify-center bg-white p-6">
            <p className="text-slate-700 font-medium">טוען...</p>
          </div>
        ) : workers.length === 0 ? (
          <div className="p-8 text-center text-slate-600 bg-white">אין עובדים.</div>
        ) : (
          <PrintDayGridView
            siteName={config?.salonName ?? "לוח זמנים"}
            dayISO={dateKey}
            workers={workers}
            bookings={bookings}
            chemicalCardsMap={chemicalCardsMap}
          />
        )}
      </div>
    );
  }

  if (!validSingleWorker) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white p-6" dir="rtl">
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
      <div className="min-h-screen flex items-center justify-center bg-white p-6" dir="rtl">
        <div className="bg-white rounded-xl shadow border border-slate-200 p-8 max-w-md text-center">
          <p className="text-slate-700 font-medium">טוען...</p>
        </div>
      </div>
    );
  }

  const bookingsForGrid = useMemo(
    () => bookings.filter((b) => b.workerId === workerId),
    [bookings, workerId]
  );

  return (
    <div ref={printRootRef} className="printRoot print-page-root" dir="rtl" data-print-route>
      <style dangerouslySetInnerHTML={{ __html: printAndScreenStyles }} />
      {closedBanner}
      <PrintDayGridView
        siteName={config?.salonName ?? "לוח זמנים"}
        dayISO={dateKey}
        workers={[worker]}
        bookings={bookingsForGrid}
        chemicalCardsMap={chemicalCardsMap}
      />
    </div>
  );
}
