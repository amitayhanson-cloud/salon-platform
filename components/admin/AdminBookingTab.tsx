"use client";

import { Fragment, useState } from "react";
import { Trash2 } from "lucide-react";
import type { SalonBookingState } from "@/types/booking";
import { getBreaksErrorForDay } from "@/lib/openingHoursValidation";

function ClosedDatesEditor({
  closedDates,
  onChange,
}: {
  closedDates: Array<{ date: string; label?: string }>;
  onChange: (closedDates: Array<{ date: string; label?: string }>) => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addDate = () => {
    setError(null);
    const raw = newDate.trim();
    if (!raw) {
      setError("נא לבחור תאריך");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      setError("תאריך לא תקין (נדרש YYYY-MM-DD)");
      return;
    }
    const existing = closedDates.map((e) => e.date);
    if (existing.includes(raw)) {
      setError("התאריך כבר ברשימה");
      return;
    }
    const next = [...closedDates, { date: raw, label: newLabel.trim() || undefined }].sort(
      (a, b) => a.date.localeCompare(b.date)
    );
    onChange(next);
    setNewDate("");
    setNewLabel("");
  };

  const removeDate = (date: string) => {
    onChange(closedDates.filter((e) => e.date !== date));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-600 mb-0.5">תאריך</label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="rounded border border-slate-300 px-2 py-2 sm:py-1.5 text-xs text-right touch-manipulation min-h-[40px] sm:min-h-0"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-0.5">תיאור (אופציונלי)</label>
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="למשל: ערב פסח"
            className="rounded border border-slate-300 px-2 py-2 sm:py-1.5 text-xs text-right w-32 touch-manipulation min-h-[40px] sm:min-h-0"
          />
        </div>
        <button
          type="button"
          onClick={addDate}
          className="min-h-[44px] px-3 py-2 sm:py-1.5 rounded-lg bg-caleno-ink text-white text-xs shadow-sm transition-all duration-200 hover:bg-[#1E293B] hover:shadow-md touch-manipulation"
        >
          הוסף תאריך
        </button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
      {closedDates.length > 0 && (
        <ul className="space-y-1">
          {closedDates.map((e) => (
            <li key={e.date} className="flex items-center gap-2 text-xs">
              <span className="text-slate-700">{e.date}</span>
              {e.label && <span className="text-slate-500">— {e.label}</span>}
              <button
                type="button"
                onClick={() => removeDate(e.date)}
                className="py-2 px-1 text-red-600 hover:underline touch-manipulation min-h-[44px] flex items-center"
                aria-label="הסר"
              >
                הסר
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminBookingTab({
  state,
  onChange,
  onSaveRequest,
  embedded = false,
  title,
  description,
}: {
  state: SalonBookingState;
  onChange: (next: SalonBookingState) => void;
  onSaveRequest?: () => void;
  /** When true, omit outer card (e.g. builder wizard already has a card). */
  embedded?: boolean;
  title?: string;
  description?: string;
}) {
  const headingTitle = title ?? "ניהול תורים ושעות פתיחה";
  const headingDescription =
    description ??
    "כאן תוכל להגדיר באילו ימים ושעות הסלון פתוח לקבלת לקוחות. הזמנות חדשות ייבנו על בסיס שעות הפתיחה האלו.";

  const updateHours = (dayIndex: number, field: "open" | "close", value: string) => {
    const updated = { ...state };
    const day = { ...updated.openingHours[dayIndex] };
    day[field] = value || null;
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  const toggleClosed = (dayIndex: number) => {
    const updated = { ...state };
    const day = { ...updated.openingHours[dayIndex] };
    const isClosed = !day.open && !day.close;
    if (isClosed) {
      day.open = "09:00";
      day.close = "18:00";
    } else {
      day.open = null;
      day.close = null;
      day.breaks = undefined;
    }
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  const updateDayBreaks = (dayIndex: number, breaks: { start: string; end: string }[]) => {
    const updated = { ...state };
    const day = { ...updated.openingHours[dayIndex], breaks };
    updated.openingHours = [
      ...updated.openingHours.slice(0, dayIndex),
      day,
      ...updated.openingHours.slice(dayIndex + 1),
    ];
    onChange(updated);
  };

  const addBreak = (dayIndex: number) => {
    const day = state.openingHours[dayIndex];
    const open = day?.open ?? "09:00";
    const close = day?.close ?? "18:00";
    const existing = day?.breaks ?? [];
    const [oh] = open.split(":").map(Number);
    const defaultStart = `${String(oh + 1).padStart(2, "0")}:00`;
    const [ch, cm] = close.split(":").map(Number);
    const defaultEnd = `${String(ch - 1).padStart(2, "0")}:${String(cm || 0).padStart(2, "0")}`;
    updateDayBreaks(dayIndex, [{ start: defaultStart, end: defaultEnd }, ...existing]);
  };

  const removeBreak = (dayIndex: number, breakIndex: number) => {
    const existing = state.openingHours[dayIndex]?.breaks ?? [];
    updateDayBreaks(dayIndex, existing.filter((_, i) => i !== breakIndex));
  };

  const updateBreak = (dayIndex: number, breakIndex: number, field: "start" | "end", value: string) => {
    const existing = [...(state.openingHours[dayIndex]?.breaks ?? [])];
    if (!existing[breakIndex]) return;
    existing[breakIndex] = { ...existing[breakIndex]!, [field]: value };
    updateDayBreaks(dayIndex, existing);
  };

  const inner = (
    <>
      <h2 className="text-lg sm:text-xl font-bold text-slate-900">{headingTitle}</h2>
      <p className="text-xs text-slate-500">{headingDescription}</p>

      {onSaveRequest && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSaveRequest}
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-caleno-ink hover:bg-[#1E293B] text-white text-sm font-semibold transition-colors touch-manipulation"
          >
            שמור שעות פעילות
          </button>
        </div>
      )}

      <div className="overflow-x-auto -mx-1 sm:mx-0 mt-4 rounded-lg border border-slate-200/60">
        <table className="w-full text-xs border-collapse min-w-[280px]" style={{ borderCollapse: "separate", borderSpacing: "0 0.5rem" }}>
          <thead className="bg-slate-50">
            <tr>
              <th className="py-2.5 px-2 sm:px-3 text-right font-medium text-slate-600">יום</th>
              <th className="py-2.5 px-2 sm:px-3 text-right font-medium text-slate-600">פתיחה</th>
              <th className="py-2.5 px-2 sm:px-3 text-right font-medium text-slate-600">סגירה</th>
              <th className="py-2.5 px-2 sm:px-3 text-right font-medium text-slate-600">מצב</th>
            </tr>
          </thead>
          <tbody>
            {state.openingHours.map((day, index) => {
              const closed = !day.open && !day.close;
              const breaks = day.breaks ?? [];
              const breaksError = getBreaksErrorForDay(day);
              return (
                <Fragment key={day.day}>
                  <tr
                    className={`[&>td]:border-slate-200/60 [&>td]:bg-white [&>td:first-child]:border-r [&>td:last-child]:border-l ${
                      closed
                        ? "[&>td]:border [&>td:first-child]:rounded-r-lg [&>td:last-child]:rounded-l-lg"
                        : "[&>td]:border-t [&>td]:border-x [&>td]:border-b-0 [&>td:first-child]:rounded-t-r-lg [&>td:last-child]:rounded-t-l-lg"
                    }`}
                  >
                    <td className="py-2.5 px-2 sm:px-3 text-slate-800 whitespace-nowrap">{day.label}</td>
                    <td className="py-2.5 px-2 sm:px-3">
                      <input
                        type="time"
                        value={day.open ?? ""}
                        disabled={closed}
                        onChange={(e) => updateHours(index, "open", e.target.value)}
                        className="w-full min-w-[72px] sm:w-24 rounded border border-slate-300 px-2 py-1.5 sm:py-1 text-xs text-right disabled:bg-slate-50 disabled:text-slate-400 touch-manipulation"
                      />
                    </td>
                    <td className="py-2.5 px-2 sm:px-3">
                      <input
                        type="time"
                        value={day.close ?? ""}
                        disabled={closed}
                        onChange={(e) => updateHours(index, "close", e.target.value)}
                        className="w-full min-w-[72px] sm:w-24 rounded border border-slate-300 px-2 py-1.5 sm:py-1 text-xs text-right disabled:bg-slate-50 disabled:text-slate-400 touch-manipulation"
                      />
                    </td>
                    <td className="py-2.5 px-2 sm:px-3" dir="ltr">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!closed}
                        aria-label={closed ? "סגור – לחץ לפתיחה" : "פתוח – לחץ לסגירה"}
                        onClick={() => toggleClosed(index)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 touch-manipulation ${
                          closed ? "bg-slate-300" : "bg-emerald-500"
                        }`}
                      >
                        <span
                          className={`pointer-events-none block h-5 w-5 shrink-0 transform rounded-full bg-white shadow ring-0 transition-transform ${
                            closed ? "translate-x-0.5" : "translate-x-5"
                          }`}
                        />
                      </button>
                    </td>
                  </tr>
                  {!closed && (
                    <tr className="[&>td]:border [&>td]:border-t-0 [&>td]:border-slate-200/60 [&>td]:rounded-b-lg bg-slate-50/50">
                      <td colSpan={4} className="py-2 px-2 sm:px-3 rounded-b-lg">
                        <div className="text-xs flex flex-wrap items-center gap-2 gap-y-2">
                          <span className="font-medium text-slate-600">הפסקות</span>
                          <button
                            type="button"
                            onClick={() => addBreak(index)}
                            className="min-h-[40px] px-2.5 py-2 sm:py-1 rounded-md border border-slate-300 bg-white text-caleno-deep hover:bg-slate-50 hover:border-caleno-deep/50 text-sm font-medium transition-colors touch-manipulation"
                          >
                            הוסף הפסקה
                          </button>
                          {breaks.map((b, bi) => (
                            <div key={bi} className="flex flex-wrap items-center gap-2">
                              <input
                                type="time"
                                value={b.start}
                                onChange={(e) => updateBreak(index, bi, "start", e.target.value)}
                                className="w-20 min-w-[70px] rounded border border-slate-300 px-1.5 py-1 sm:py-0.5 text-right touch-manipulation"
                              />
                              <span className="text-slate-400">–</span>
                              <input
                                type="time"
                                value={b.end}
                                onChange={(e) => updateBreak(index, bi, "end", e.target.value)}
                                className="w-20 min-w-[70px] rounded border border-slate-300 px-1.5 py-1 sm:py-0.5 text-right touch-manipulation"
                              />
                              <button
                                type="button"
                                onClick={() => removeBreak(index, bi)}
                                className="p-2 sm:p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors touch-manipulation"
                                title="מחק הפסקה"
                                aria-label="מחק הפסקה"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          {breaksError && <p className="text-red-600 mt-0.5">{breaksError}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 pt-4 sm:pt-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">תאריכים סגורים (חגים)</h3>
        <p className="text-xs text-slate-500 mb-3">
          בימים אלו העסק סגור. לא יוצגו שעות זמינות לאף עובד.
        </p>
        <ClosedDatesEditor
          closedDates={state.closedDates ?? []}
          onChange={(closedDates) => onChange({ ...state, closedDates })}
        />
      </div>

      <div className="pt-2 text-xs text-slate-500">
        אורך ברירת מחדל של כל תור:{" "}
        <span className="font-semibold">{state.defaultSlotMinutes} דקות</span>{" "}
        (ניתן לשנות זאת בהמשך בהגדרות מתקדמות).
      </div>
    </>
  );

  if (embedded) {
    return <div className="text-right space-y-4 sm:space-y-6">{inner}</div>;
  }

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-4 sm:p-6 text-right space-y-4 sm:space-y-6">
      {inner}
    </div>
  );
}
