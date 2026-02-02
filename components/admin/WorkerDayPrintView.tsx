"use client";

import React from "react";

/**
 * Print-optimized view of one worker's schedule for a single day.
 * Renders header (site name, date, worker name) and a chronological list of bookings.
 * Use with @media print so only this content is visible when printing.
 */

/** Chemical card data for print (colors + oxygen arrays from client doc). */
export interface ChemicalCardPrintData {
  colors: Array<{ colorNumber?: string; amount?: string; notes?: string }>;
  oxygen: Array<{ percentage?: string; amount?: string; notes?: string }>;
}

export interface PrintBookingRow {
  startAt: Date;
  endAt: Date;
  customerName: string;
  serviceName: string;
  phase?: 1 | 2;
  note?: string | null;
  /** Client doc key (normalized phone) for chemical card lookup. */
  clientKey: string;
}

export interface WorkerDayPrintViewProps {
  siteName: string;
  dayISO: string;
  worker: { id: string; name: string };
  bookingsForWorkerDay: PrintBookingRow[];
  /** Map clientKey -> chemical card data (or null). Fetched once per print load. */
  chemicalCardsMap?: Record<string, ChemicalCardPrintData | null>;
}

function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateLabel(dayISO: string): string {
  const [y, m, d] = dayISO.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const dayName = dayNames[date.getDay()];
  return `${dayName} ${d}/${m}/${y}`;
}

function ChemicalCardBlock({ card }: { card: ChemicalCardPrintData | null }) {
  if (!card) return <span className="print-chemical-none">כרטיס כימי: אין</span>;
  const hasColors = card.colors?.length > 0;
  const hasOxygen = card.oxygen?.length > 0;
  if (!hasColors && !hasOxygen) return <span className="print-chemical-none">כרטיס כימי: ריק</span>;
  const colors = card.colors ?? [];
  const oxygen = card.oxygen ?? [];
  return (
    <div className="print-chemical-block">
      {hasColors && (
        <div className="print-chemical-section">
          <span className="print-chemical-label">צבע:</span>{" "}
          {colors.map((c, i) => (
            <span key={i}>
              {[c.colorNumber, c.amount].filter(Boolean).join(" ")}
              {c.notes ? ` (${c.notes})` : ""}
              {i < colors.length - 1 ? "; " : ""}
            </span>
          ))}
        </div>
      )}
      {hasOxygen && (
        <div className="print-chemical-section">
          <span className="print-chemical-label">חמצן:</span>{" "}
          {oxygen.map((o, i) => (
            <span key={i}>
              {[o.percentage, o.amount].filter(Boolean).join(" ")}
              {o.notes ? ` (${o.notes})` : ""}
              {i < oxygen.length - 1 ? "; " : ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkerDayPrintView({
  siteName,
  dayISO,
  worker,
  bookingsForWorkerDay,
  chemicalCardsMap = {},
}: WorkerDayPrintViewProps) {
  const dateLabel = formatDateLabel(dayISO);
  const sorted = [...bookingsForWorkerDay].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime()
  );

  return (
    <div className="worker-day-print-root" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .worker-day-print-root,
          .worker-day-print-root * {
            visibility: visible;
          }
          .worker-day-print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 0;
            margin: 0;
            background: white;
            font-size: 12pt;
          }
          .worker-day-print-root .print-header {
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid #333;
          }
          .worker-day-print-root .print-header h1 {
            font-size: 14pt;
            margin: 0 0 0.25rem 0;
          }
          .worker-day-print-root .print-header .meta {
            font-size: 11pt;
            color: #444;
          }
          .worker-day-print-root .print-table {
            width: 100%;
            border-collapse: collapse;
          }
          .worker-day-print-root .print-table th {
            text-align: right;
            padding: 0.35rem 0.5rem;
            border-bottom: 1px solid #ccc;
            font-size: 10pt;
            font-weight: 600;
          }
          .worker-day-print-root .print-table td {
            padding: 0.4rem 0.5rem;
            border-bottom: 1px solid #eee;
            font-size: 11pt;
          }
          .worker-day-print-root .print-table tr.print-booking-row,
          .worker-day-print-root .print-table tr.print-chemical-row {
            page-break-inside: avoid;
          }
          .worker-day-print-root .print-chemical-cell {
            padding: 0.25rem 0.5rem 0.5rem 0.5rem;
            font-size: 9pt;
            color: #444;
            border-bottom: 1px solid #eee;
            vertical-align: top;
          }
          .worker-day-print-root .print-chemical-block {
            display: flex;
            flex-wrap: wrap;
            gap: 0 0.75rem;
          }
          .worker-day-print-root .print-chemical-section { white-space: normal; }
          .worker-day-print-root .print-chemical-label { font-weight: 600; }
          .worker-day-print-root .print-chemical-none { font-style: italic; color: #666; }
          .worker-day-print-root .print-empty {
            padding: 1rem 0;
            color: #666;
            font-size: 11pt;
          }
        }
        @media screen {
          .worker-day-print-root {
            max-width: 600px;
            margin: 0 auto;
            padding: 1.5rem;
            font-size: 12pt;
            background: white;
          }
          .worker-day-print-root .print-header {
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid #333;
          }
          .worker-day-print-root .print-header h1 {
            font-size: 14pt;
            margin: 0 0 0.25rem 0;
          }
          .worker-day-print-root .print-header .meta {
            font-size: 11pt;
            color: #444;
          }
          .worker-day-print-root .print-table {
            width: 100%;
            border-collapse: collapse;
          }
          .worker-day-print-root .print-table th {
            text-align: right;
            padding: 0.35rem 0.5rem;
            border-bottom: 1px solid #ccc;
            font-size: 10pt;
            font-weight: 600;
          }
          .worker-day-print-root .print-table td {
            padding: 0.4rem 0.5rem;
            border-bottom: 1px solid #eee;
            font-size: 11pt;
          }
          .worker-day-print-root .print-chemical-cell {
            padding: 0.25rem 0.5rem 0.5rem 0.5rem;
            font-size: 9pt;
            color: #444;
          }
          .worker-day-print-root .print-chemical-block { display: flex; flex-wrap: wrap; gap: 0 0.75rem; }
          .worker-day-print-root .print-chemical-section { white-space: normal; }
          .worker-day-print-root .print-chemical-label { font-weight: 600; }
          .worker-day-print-root .print-chemical-none { font-style: italic; color: #666; }
          .worker-day-print-root .print-empty {
            padding: 1rem 0;
            color: #666;
            font-size: 11pt;
          }
        }
      ` }} />
      <div className="print-header">
        <h1>{siteName}</h1>
        <div className="meta">
          {dateLabel} · {worker.name}
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="print-empty">אין תורים ליום זה</p>
      ) : (
        <table className="print-table">
          <thead>
            <tr>
              <th>שעה</th>
              <th>לקוח</th>
              <th>שירות</th>
              <th>שלב</th>
              <th>הערות</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <React.Fragment key={i}>
                <tr className="print-booking-row">
                  <td>
                    {formatTime(row.startAt)}–{formatTime(row.endAt)}
                  </td>
                  <td>{row.customerName || "—"}</td>
                  <td>{row.serviceName || "—"}</td>
                  <td>{row.phase != null ? `שלב ${row.phase}` : "—"}</td>
                  <td>{row.note?.trim() || "—"}</td>
                </tr>
                <tr className="print-chemical-row">
                  <td colSpan={5} className="print-chemical-cell">
                    <ChemicalCardBlock card={chemicalCardsMap[row.clientKey] ?? null} />
                  </td>
                </tr>
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
