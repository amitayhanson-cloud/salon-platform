"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { parseFileStrict } from "@/lib/import/parse";
import type { ParsedClientRow } from "@/lib/import/parse";
import type { ExecuteResult } from "@/lib/import/types";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { getAdminBasePathFromSiteId } from "@/lib/url";

type Step = 0 | 1 | 2;

const EXECUTE_TIMEOUT_MS = 180_000;

/** Example rows for the format section (static, no download). */
const EXAMPLE_ROWS: { name: string; phone: string; notes: string; client_type: string }[] = [
  { name: "ישראל ישראלי", phone: "0501234567", notes: "הערה", client_type: "Regular" },
  { name: "משה כהן", phone: "052-987-6543", notes: "", client_type: "VIP" },
  { name: "רחל לוי", phone: "0541112233", notes: "לקוחה קבועה", client_type: "Regular" },
];

export default function ImportPage() {
  const params = useParams();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const basePath = getAdminBasePathFromSiteId(siteId);

  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedClientRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | undefined>();
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeProgress, setExecuteProgress] = useState<{ done: number; total: number } | null>(null);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f || loading) return;
      setError(null);
      setValidationErrors([]);
      setParsedRows([]);
      setSheetName(undefined);
      setFile(f);
      setLoading(true);
      (e.target as HTMLInputElement).value = "";

      try {
        const result = await parseFileStrict(f);
        setValidationErrors(result.validationErrors ?? []);
        setParsedRows(result.rows ?? []);
        setSheetName(result.sheetName);
        if (result.validationErrors?.length && result.rows?.length === 0) {
          setError(result.validationErrors[0] ?? "שגיאה בקובץ");
        }
        if (result.rows?.length === 0 && !result.validationErrors?.length) {
          setError("אין שורות נתונים תקינות בקובץ.");
        }
        setStep(1);
      } catch (err) {
        if (process.env.NODE_ENV === "development") console.error("[import] Parse error:", err);
        setError("לא הצלחנו לקרוא את הקובץ.");
      } finally {
        setLoading(false);
      }
    },
    [loading]
  );

  const handleExecute = useCallback(async () => {
    if (!firebaseUser || !siteId || parsedRows.length === 0) return;
    setError(null);
    setLoading(true);
    setExecuteResult(null);
    setExecuteProgress(null);

    try {
      const token = await firebaseUser.getIdToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EXECUTE_TIMEOUT_MS);
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, rows: parsedRows }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || res.statusText);
      }
      const data = (await res.json()) as ExecuteResult & { ok?: boolean };
      setExecuteResult(data);
      setStep(2);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError("הייבוא לוקח יותר מדי זמן — נסה שוב או פחות שורות.");
      } else {
        setError(err instanceof Error ? err.message : "ייבוא נכשל.");
      }
    } finally {
      setLoading(false);
      setExecuteProgress(null);
    }
  }, [firebaseUser, siteId, parsedRows]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">ייבוא לקוחות (CSV / Excel)</h1>
        {step === 0 ? (
          <Link href={`${basePath}/settings`} className="text-sm text-sky-600 hover:text-sky-800">
            ← חזרה להגדרות
          </Link>
        ) : (
          <button type="button" onClick={() => setStep((s) => (s - 1) as Step)} className="text-sm text-sky-600 hover:text-sky-800">
            ← חזרה
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="flex gap-2 mb-8">
        {([0, 1, 2] as Step[]).map((s) => (
          <div key={s} className={`h-2 flex-1 rounded ${step >= s ? "bg-sky-500" : "bg-slate-200"}`} />
        ))}
      </div>

      {/* Step 0: Upload entry */}
      {step === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">ייבוא קובץ</h2>
          <p className="text-sm text-slate-600 mb-4">
            העלה קובץ CSV או Excel עם עמודות בדיוק: שם, טלפון (חובה), הערות, סוג לקוח (אופציונלי). שורה ראשונה = כותרות.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-sm font-medium">שם *</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-sm font-medium">טלפון *</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm">הערות</span>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm">סוג לקוח</span>
          </div>
          <label className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium cursor-pointer">
            <Upload className="w-5 h-5" />
            העלה קובץ לייבוא
            <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
          </label>
        </div>
      )}

      {/* Step 1: File picker + preview */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">העלאת קובץ</h2>
          <p className="text-sm text-slate-600 mb-4">קובץ CSV או XLSX. שורה ראשונה חייבת להכיל כותרות: שם | טלפון | הערות | סוג לקוח (מתקבלים גם באנגלית: name, phone, notes, client type).</p>

          {!file ? (
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
              <Upload className="w-10 h-10 text-slate-400 mb-2" />
              <span className="text-sm text-slate-600">לחץ לבחירת קובץ או גרור לכאן</span>
              <span className="text-xs text-slate-500 mt-1">.csv או .xlsx</span>
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
            </label>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-2">נבחר: {file.name}</p>
              <label className="inline-block px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm cursor-pointer mb-4">
                החלף קובץ
                <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
              </label>
            </>
          )}

          {loading && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
              <span className="text-sm text-slate-500">טוען קובץ…</span>
            </div>
          )}

          {/* Header validation error: extra/missing columns */}
          {validationErrors.length > 0 && parsedRows.length === 0 && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-2">שגיאת פורמט קובץ</p>
              <p className="text-sm text-red-700">
                הקובץ חייב להכיל עמודות: שם, טלפון (חובה) ו- הערות, סוג לקוח (אופציונלי). אין להוסיף עמודות נוספות.
              </p>
              <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                {validationErrors.slice(0, 5).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
                {validationErrors.length > 5 && <li>…ועוד {validationErrors.length - 5}</li>}
              </ul>
            </div>
          )}

          {/* Preview table: 4 columns */}
          {parsedRows.length > 0 && (
            <>
              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-medium text-slate-600 mb-2">תצוגה מקדימה</p>
                {sheetName && <p className="text-xs text-slate-500 mb-1">גיליון: {sheetName}</p>}
                <p className="text-xs text-slate-500 mb-3">
                  שורות: {parsedRows.length}. עמודות: שם | טלפון | הערות | סוג לקוח
                </p>
                <div className="overflow-x-auto max-h-48 border border-slate-200 rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-2 py-1 text-right border-b">#</th>
                        <th className="px-2 py-1 text-right border-b">שם</th>
                        <th className="px-2 py-1 text-right border-b">טלפון</th>
                        <th className="px-2 py-1 text-right border-b">הערות</th>
                        <th className="px-2 py-1 text-right border-b">סוג לקוח</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 15).map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-2 py-1">{row.__rowNumber ?? i + 1}</td>
                          <td className="px-2 py-1 max-w-[100px] truncate">{row.name ?? ""}</td>
                          <td className="px-2 py-1 max-w-[100px] truncate font-mono">{row.phone ?? ""}</td>
                          <td className="px-2 py-1 max-w-[100px] truncate">{row.notes ?? ""}</td>
                          <td className="px-2 py-1 max-w-[80px] truncate">{row.client_type ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 15 && <p className="text-xs text-slate-500 mt-1">…ועוד {parsedRows.length - 15} שורות</p>}
              </div>

              {validationErrors.length > 0 && (
                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800 mb-1">שגיאות שורות (יידולגו)</p>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {validationErrors.slice(0, 10).map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                    {validationErrors.length > 10 && <li>…ועוד {validationErrors.length - 10}</li>}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={loading || parsedRows.length === 0}
                  className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent ml-2" />
                      מייבא…
                    </>
                  ) : (
                    "הרץ ייבוא"
                  )}
                </button>
                <button type="button" onClick={() => setStep(0)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm">
                  חזרה
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 2: Result */}
      {step === 2 && executeResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            הייבוא הושלם
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-700">נוצרו</p>
              <p className="text-xl font-semibold text-green-800">{executeResult.clientsCreated}</p>
            </div>
            <div className="p-4 bg-sky-50 rounded-lg">
              <p className="text-xs text-sky-700">עודכנו</p>
              <p className="text-xl font-semibold text-sky-800">{executeResult.clientsUpdated}</p>
            </div>
            <div className="p-4 bg-slate-100 rounded-lg">
              <p className="text-xs text-slate-600">דולגו</p>
              <p className="text-xl font-semibold text-slate-800">{executeResult.clientsSkipped ?? 0}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-xs text-red-600">נכשלו</p>
              <p className="text-xl font-semibold text-red-700">{executeResult.clientsFailed ?? 0}</p>
            </div>
          </div>
          {executeResult.errors.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-red-800 mb-2">שגיאות ({executeResult.errors.length})</p>
              <div className="max-h-40 overflow-y-auto border border-red-100 rounded-lg p-3">
                <ul className="text-sm text-red-700 space-y-1">
                  {executeResult.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>
                      שורה {e.row}: {e.message}
                    </li>
                  ))}
                  {executeResult.errors.length > 30 && <li>…ועוד {executeResult.errors.length - 30}</li>}
                </ul>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Link href={`${basePath}/settings`} className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium">
              סיום
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep(0);
                setFile(null);
                setParsedRows([]);
                setValidationErrors([]);
                setExecuteResult(null);
                setError(null);
              }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm"
            >
              ייבוא נוסף
            </button>
          </div>
        </div>
      )}

      {/* Example section (bottom) */}
      <div className="mt-10 pt-8 border-t border-slate-200">
        <h3 className="text-base font-semibold text-slate-700 mb-3">דוגמת קובץ</h3>
        <p className="text-sm text-slate-600 mb-3">הקובץ חייב להתאים בדיוק לפורמט הזה. שורה ראשונה = כותרות.</p>
        <div className="overflow-x-auto border border-slate-200 rounded-lg mb-4">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-3 py-2 text-right border-b">שם</th>
                <th className="px-3 py-2 text-right border-b">טלפון</th>
                <th className="px-3 py-2 text-right border-b">הערות</th>
                <th className="px-3 py-2 text-right border-b">סוג לקוח</th>
              </tr>
            </thead>
            <tbody>
              {EXAMPLE_ROWS.map((row, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 font-mono">{row.phone}</td>
                  <td className="px-3 py-2">{row.notes}</td>
                  <td className="px-3 py-2">{row.client_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
          <li>נתמך: CSV, XLSX</li>
          <li>שורה ראשונה חייבת להכיל כותרות: שם | טלפון | הערות | סוג לקוח</li>
          <li>שם וטלפון חובה</li>
          <li>סוג לקוח חייב להתאים לסוגים המוגדרים באתר (למשל רגיל, VIP, פעיל, חדש, רדום)</li>
        </ul>
      </div>
    </div>
  );
}
