"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { parseFile } from "@/lib/import/parse";
import { autoDetectMapping } from "@/lib/import/mapRow";
import type { RawRow, ColumnMapping, DryRunResult, ExecuteResult } from "@/lib/import/types";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5;

export default function ImportPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const basePath = siteId && siteId !== "me" ? `/site/${siteId}/admin` : "/site/me/admin";

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setFile(f);
    setLoading(true);
    try {
      const result = await parseFile(f);
      setRows(result.rows);
      setHeaders(result.headers);
      setMapping(autoDetectMapping(result.headers));
      if (result.errors.length) setError(result.errors.join("; "));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDryRun = useCallback(async () => {
    if (!firebaseUser || !siteId) return;
    setError(null);
    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/import/dry-run", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, rows, mapping }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data: DryRunResult = await res.json();
      setDryRunResult(data);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dry run failed");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, siteId, rows, mapping]);

  const handleExecute = useCallback(async () => {
    if (!firebaseUser || !siteId) return;
    setError(null);
    setLoading(true);
    setExecuteResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ siteId, rows, mapping, skipRowsWithErrors: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data: ExecuteResult = await res.json();
      setExecuteResult(data);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, siteId, rows, mapping]);

  const downloadErrorCsv = useCallback(() => {
    const result = executeResult ?? dryRunResult;
    if (!result?.errors?.length) return;
    const header = "row,field,message\n";
    const body = result.errors
      .map((e) => {
        const msg = (e.message ?? "").replace(/"/g, '""');
        return `${e.row},"${e.field ?? ""}","${msg}"`;
      })
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [executeResult, dryRunResult]);

  const fieldLabels: Record<string, string> = {
    clientId: "מזהה לקוח",
    name: "שם",
    phone: "טלפון",
    email: "אימייל",
    notes: "הערות",
    date: "תאריך",
    startTime: "שעת התחלה",
    durationMin: "משך (דקות)",
    serviceTypeId: "מזהה שירות",
    serviceName: "שם שירות",
    workerId: "מזהה מטפל",
    workerName: "שם מטפל",
    customerPhone: "טלפון לקוח",
    customerName: "שם לקוח",
    status: "סטטוס",
    note: "הערת תור",
    phase: "שלב",
    parentGroupKey: "מפתח קבוצה",
    followUpServiceName: "שירות המשך",
    waitMinutes: "המתנה (דקות)",
    followUpDurationMin: "משך המשך (דקות)",
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">ייבוא CSV / Excel</h1>
        <Link
          href={`${basePath}/settings`}
          className="text-sm text-sky-600 hover:text-sky-800"
        >
          ← חזרה להגדרות
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {([1, 2, 3, 4, 5] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded ${
              step >= s ? "bg-sky-500" : "bg-slate-200"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">העלאת קובץ</h2>
          <p className="text-sm text-slate-600 mb-4">
            העלה קובץ CSV או Excel (.xlsx) שמיוצא מהמערכת הישנה. העמודות ימופו בשנייה הבאה.
          </p>
          <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
            <Upload className="w-10 h-10 text-slate-400 mb-2" />
            <span className="text-sm text-slate-600">לחץ לבחירת קובץ או גרור לכאן</span>
            <span className="text-xs text-slate-500 mt-1">.csv או .xlsx</span>
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls"
              onChange={handleUpload}
              disabled={loading}
            />
          </label>
          {loading && <p className="mt-4 text-sm text-slate-500">טוען...</p>}
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">מיפוי עמודות</h2>
          <p className="text-sm text-slate-600 mb-6">
            התאמה אוטומטית בוצעה. בדוק ועדכן את המיפוי של כל שדה לשם העמודה בקובץ.
          </p>
          <div className="space-y-3">
            {["phone", "customerPhone", "name", "customerName", "date", "startTime", "durationMin", "serviceName", "workerName", "status", "note"].map(
              (field) => (
                <div key={field} className="flex items-center gap-4">
                  <label className="w-40 text-sm font-medium text-slate-700">
                    {fieldLabels[field] ?? field}
                  </label>
                  <select
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    value={mapping[field] ?? ""}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  >
                    <option value="">— לא למפות —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              )
            )}
          </div>
          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium"
            >
              המשך לתצוגה מקדימה
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">תצוגה מקדימה</h2>
          <p className="text-sm text-slate-600 mb-4">
            {rows.length} שורות. הרץ בדיקה יבשה (ללא שמירה) כדי לראות סיכום ושגיאות.
          </p>
          <div className="overflow-x-auto max-h-60 border border-slate-200 rounded-lg mb-6">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-right border-b">#</th>
                  {headers.slice(0, 8).map((h) => (
                    <th key={h} className="px-2 py-1 text-right border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-2 py-1">{i + 1}</td>
                    {headers.slice(0, 8).map((h) => (
                      <td key={h} className="px-2 py-1 max-w-[120px] truncate">
                        {row[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <p className="text-xs text-slate-500 p-2">... ועוד {rows.length - 20} שורות</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={handleDryRun}
              disabled={loading}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? "בודק..." : "הרץ בדיקה יבשה (ללא שמירה)"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Dry-run summary + Confirm */}
      {step === 4 && dryRunResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">סיכום בדיקה יבשה</h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">לקוחות ליצירה/עדכון</p>
              <p className="text-xl font-semibold">{dryRunResult.clientsToCreate}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">תורים ליצירה</p>
              <p className="text-xl font-semibold">{dryRunResult.bookingsToCreate}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">תורים לדילוג (כפולים)</p>
              <p className="text-xl font-semibold">{dryRunResult.bookingsToSkip}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-xs text-red-600">שגיאות</p>
              <p className="text-xl font-semibold text-red-700">{dryRunResult.errors.length}</p>
            </div>
          </div>
          {dryRunResult.errors.length > 0 && (
            <div className="mb-6 max-h-40 overflow-y-auto border border-red-100 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-2">פרטי שגיאות:</p>
              <ul className="text-sm text-red-700 space-y-1">
                {dryRunResult.errors.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    שורה {e.row}: {e.message}
                  </li>
                ))}
                {dryRunResult.errors.length > 30 && (
                  <li>... ועוד {dryRunResult.errors.length - 30} שגיאות</li>
                )}
              </ul>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm"
            >
              חזרה
            </button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={loading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? "מייבא..." : "אשר וייבא"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Report */}
      {step === 5 && executeResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            הייבוא הושלם
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-700">לקוחות נוצרו</p>
              <p className="text-xl font-semibold text-green-800">{executeResult.clientsCreated}</p>
            </div>
            <div className="p-4 bg-sky-50 rounded-lg">
              <p className="text-xs text-sky-700">לקוחות עודכנו</p>
              <p className="text-xl font-semibold text-sky-800">{executeResult.clientsUpdated}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-xs text-green-700">תורים נוצרו</p>
              <p className="text-xl font-semibold text-green-800">{executeResult.bookingsCreated}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600">תורים דולגו (כפולים)</p>
              <p className="text-xl font-semibold">{executeResult.bookingsSkipped}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-xs text-red-600">תורים נכשלו</p>
              <p className="text-xl font-semibold text-red-700">{executeResult.bookingsFailed}</p>
            </div>
          </div>
          {executeResult.errors.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-red-800">שגיאות ({executeResult.errors.length})</p>
                <button
                  type="button"
                  onClick={downloadErrorCsv}
                  className="text-sm text-sky-600 hover:text-sky-800"
                >
                  הורד CSV שגיאות
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-red-100 rounded-lg p-3">
                <ul className="text-sm text-red-700 space-y-1">
                  {executeResult.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>
                      שורה {e.row}: {e.message}
                    </li>
                  ))}
                  {executeResult.errors.length > 30 && (
                    <li>... ועוד {executeResult.errors.length - 30} — הורד את הקובץ לפרטים</li>
                  )}
                </ul>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Link
              href={`${basePath}/settings`}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium"
            >
              סיום
            </Link>
            <button
              type="button"
              onClick={() => { setStep(1); setFile(null); setRows([]); setDryRunResult(null); setExecuteResult(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm"
            >
              ייבוא נוסף
            </button>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        ייבוא בטוח: תורים עם אותו מפתח ייבוא ידולגו (אין כפילויות). לקוחות מתעדכנים לפי טלפון.
      </p>
    </div>
  );
}
