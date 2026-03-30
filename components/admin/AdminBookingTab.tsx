"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { OpeningHours, SalonBookingState } from "@/types/booking";
import { getBreaksErrorForDay } from "@/lib/openingHoursValidation";

function cloneBreaks(breaks?: OpeningHours["breaks"]): OpeningHours["breaks"] | undefined {
  if (!breaks?.length) return undefined;
  return breaks.map((b) => ({ ...b }));
}

function TimeField({
  value,
  disabled,
  onChange,
  ariaLabel,
}: {
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition-colors focus:border-caleno-deep/40 focus:outline-none focus:ring-2 focus:ring-caleno-deep/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-70"
    />
  );
}

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

  const firstActiveDayIndex = useMemo(
    () => state.openingHours.findIndex((d) => d.open && d.close),
    [state.openingHours]
  );

  const copyFirstActiveToAllWeek = useCallback(() => {
    if (firstActiveDayIndex < 0) return;
    const src = state.openingHours[firstActiveDayIndex]!;
    const open = src.open;
    const close = src.close;
    const breaksClone = cloneBreaks(src.breaks);
    const updated: SalonBookingState = {
      ...state,
      openingHours: state.openingHours.map((d) => ({
        ...d,
        open,
        close,
        breaks: breaksClone ? breaksClone.map((b) => ({ ...b })) : undefined,
      })),
    };
    onChange(updated);
  }, [firstActiveDayIndex, onChange, state]);

  const renderDaySwitch = (closed: boolean, index: number) => (
    <button
      type="button"
      dir="ltr"
      role="switch"
      aria-checked={!closed}
      aria-label={closed ? "סגור – לחץ לפתיחה" : "פתוח – לחץ לסגירה"}
      onClick={() => toggleClosed(index)}
      className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/60 focus:ring-offset-2 touch-manipulation ${
        closed ? "bg-slate-300" : "bg-emerald-500"
      }`}
    >
      <span
        className={`pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-[inset-inline-start] duration-200 ease-out ${
          closed ? "start-1" : "start-[calc(100%-1.25rem-0.25rem)]"
        }`}
      />
    </button>
  );

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

      <div className="mt-5 flex flex-col gap-3 sm:mt-6">
        <button
          type="button"
          onClick={copyFirstActiveToAllWeek}
          disabled={firstActiveDayIndex < 0}
          title={
            firstActiveDayIndex < 0
              ? "אין יום פעיל — הפעיל לפחות יום אחד"
              : "מעתיק פתיחה, סגירה והפסקות מהיום הפעול הראשון לכל השבוע"
          }
          className="self-start rounded-xl border border-slate-200/90 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          העתק לכל השבוע
        </button>

        {/* Mobile: card stack */}
        <div className="space-y-4 md:hidden">
          {state.openingHours.map((day, index) => {
            const closed = !day.open && !day.close;
            const breaks = day.breaks ?? [];
            const breaksError = getBreaksErrorForDay(day);
            return (
              <div
                key={day.day}
                className={`rounded-2xl border p-4 transition-colors ${
                  closed
                    ? "border-slate-100 bg-slate-50/80 text-slate-500 shadow-none"
                    : "border-slate-100 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3" dir="rtl">
                  <span className={`text-base font-semibold ${closed ? "text-slate-500" : "text-slate-900"}`}>
                    {day.label}
                  </span>
                  {renderDaySwitch(closed, index)}
                </div>

                {!closed && (
                  <>
                    <div className="mt-4 flex gap-3" dir="rtl">
                      <TimeField
                        value={day.open ?? ""}
                        disabled={closed}
                        onChange={(v) => updateHours(index, "open", v)}
                        ariaLabel={`שעת פתיחה — ${day.label}`}
                      />
                      <TimeField
                        value={day.close ?? ""}
                        disabled={closed}
                        onChange={(v) => updateHours(index, "close", v)}
                        ariaLabel={`שעת סגירה — ${day.label}`}
                      />
                    </div>

                    <div className="mt-4 space-y-3 border-t border-slate-100/90 pt-4">
                      <p className="text-xs font-medium text-slate-500">הפסקות</p>
                      {breaks.map((b, bi) => (
                        <div key={bi} className="flex flex-wrap items-center gap-2" dir="rtl">
                          <input
                            type="time"
                            value={b.start}
                            onChange={(e) => updateBreak(index, bi, "start", e.target.value)}
                            className="min-h-[44px] min-w-[7.5rem] flex-1 rounded-xl border border-slate-200/90 px-3 py-2 text-sm text-right shadow-sm focus:border-caleno-deep/40 focus:outline-none focus:ring-2 focus:ring-caleno-deep/15 sm:flex-none"
                          />
                          <span className="text-slate-300">–</span>
                          <input
                            type="time"
                            value={b.end}
                            onChange={(e) => updateBreak(index, bi, "end", e.target.value)}
                            className="min-h-[44px] min-w-[7.5rem] flex-1 rounded-xl border border-slate-200/90 px-3 py-2 text-sm text-right shadow-sm focus:border-caleno-deep/40 focus:outline-none focus:ring-2 focus:ring-caleno-deep/15 sm:flex-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeBreak(index, bi)}
                            className="rounded-xl p-2.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="מחק הפסקה"
                            aria-label="מחק הפסקה"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {breaksError && <p className="text-sm text-red-600">{breaksError}</p>}
                    </div>

                    <div className="mt-5 flex justify-center border-t border-slate-100/90 pt-4">
                      <button
                        type="button"
                        onClick={() => addBreak(index)}
                        className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-caleno-deep"
                      >
                        + הוסף הפסקה
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop: table */}
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] md:block">
          <table
            className="w-full min-w-[520px] border-collapse text-xs"
            style={{ borderCollapse: "separate", borderSpacing: "0 0.5rem" }}
          >
            <thead className="bg-slate-50/90">
              <tr>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">יום</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">פתיחה</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">סגירה</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-slate-600">מצב</th>
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
                      className={`[&>td]:border-slate-100 [&>td]:bg-white [&>td:first-child]:border-r [&>td:last-child]:border-l ${
                        closed
                          ? "[&>td]:border [&>td:first-child]:rounded-r-xl [&>td:last-child]:rounded-l-xl [&>td]:opacity-80"
                          : "[&>td]:border-t [&>td]:border-x [&>td]:border-b-0 [&>td:first-child]:rounded-t-r-xl [&>td:last-child]:rounded-t-l-xl"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">{day.label}</td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={day.open ?? ""}
                          disabled={closed}
                          onChange={(e) => updateHours(index, "open", e.target.value)}
                          className="max-w-[9rem] w-full rounded-xl border border-slate-200/90 px-3 py-2 text-sm text-right shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="time"
                          value={day.close ?? ""}
                          disabled={closed}
                          onChange={(e) => updateHours(index, "close", e.target.value)}
                          className="max-w-[9rem] w-full rounded-xl border border-slate-200/90 px-3 py-2 text-sm text-right shadow-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </td>
                      <td className="px-4 py-3" dir="ltr">
                        {renderDaySwitch(closed, index)}
                      </td>
                    </tr>
                    {!closed && (
                      <tr className="[&>td]:border [&>td]:border-t-0 [&>td]:border-slate-100 [&>td]:rounded-b-xl [&>td]:bg-slate-50/40">
                        <td colSpan={4} className="rounded-b-xl px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-medium text-slate-600">הפסקות</span>
                            <button
                              type="button"
                              onClick={() => addBreak(index)}
                              className="rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-caleno-deep/30 hover:text-caleno-deep"
                            >
                              הוסף הפסקה
                            </button>
                            {breaks.map((b, bi) => (
                              <div key={bi} className="flex flex-wrap items-center gap-2">
                                <input
                                  type="time"
                                  value={b.start}
                                  onChange={(e) => updateBreak(index, bi, "start", e.target.value)}
                                  className="w-24 rounded-xl border border-slate-200/90 px-2 py-1.5 text-right shadow-sm"
                                />
                                <span className="text-slate-400">–</span>
                                <input
                                  type="time"
                                  value={b.end}
                                  onChange={(e) => updateBreak(index, bi, "end", e.target.value)}
                                  className="w-24 rounded-xl border border-slate-200/90 px-2 py-1.5 text-right shadow-sm"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeBreak(index, bi)}
                                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                                  title="מחק הפסקה"
                                  aria-label="מחק הפסקה"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                            {breaksError && <p className="w-full text-red-600">{breaksError}</p>}
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
