"use client";

import { useState, useCallback } from "react";
import { parseFileStrict } from "@/lib/import/parse";
import type { ParsedClientRow } from "@/lib/import/parse";
import type { ExecuteResult } from "@/lib/import/types";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type Step = 0 | 1 | 2;

const EXECUTE_TIMEOUT_MS = 180_000;

const EXAMPLE_ROWS: { name: string; phone: string; notes: string; client_type: string }[] = [
  { name: "ישראל ישראלי", phone: "0501234567", notes: "הערה", client_type: "Regular" },
  { name: "משה כהן", phone: "052-987-6543", notes: "", client_type: "VIP" },
  { name: "רחל לוי", phone: "0541112233", notes: "לקוחה קבועה", client_type: "Regular" },
];

export default function ClientImportSection({ siteId }: { siteId: string }) {
  const { firebaseUser } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedClientRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | undefined>();
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      } catch {
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
      const data = (await res.json()) as ExecuteResult;
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
    }
  }, [firebaseUser, siteId, parsedRows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-[#0F172A] mb-1">ייבוא לקוחות</h2>
        <p className="text-sm text-slate-500">
          עוברים ממערכת קודמת? רוצים להעביר את הלקוחות שלכם למערכת? העלו קובץ Excel כדי להעביר את כל הלקוחות בקלות.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-2 mb-6">
          {([0, 1, 2] as Step[]).map((s) => (
            <div key={s} className={`h-2 flex-1 rounded ${step >= s ? "bg-caleno-deep" : "bg-[#E2E8F0]"}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="rounded-xl border border-slate-200 p-8 bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">ייבוא קובץ</h3>
            <p className="text-sm text-slate-600 mb-4">
              העלה קובץ CSV או Excel עם עמודות: שם, טלפון (חובה), הערות, סוג לקוח (אופציונלי).
            </p>
            <label className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-caleno-ink hover:bg-[#1E293B] text-white rounded-lg text-sm font-medium cursor-pointer">
              <Upload className="w-5 h-5" />
              העלה קובץ לייבוא
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="rounded-xl border border-slate-200 p-8 bg-slate-50/50 space-y-4">
            <h3 className="text-lg font-semibold text-slate-800">בדיקה לפני ייבוא</h3>
            {file && <p className="text-sm text-slate-600">נבחר: {file.name}</p>}
            {sheetName && <p className="text-xs text-slate-500">גיליון: {sheetName}</p>}
            {parsedRows.length > 0 && (
              <p className="text-sm text-slate-600">שורות תקינות לייבוא: {parsedRows.length}</p>
            )}
            {validationErrors.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm font-medium text-amber-800 mb-1">שגיאות שורות (יידולגו)</p>
                <ul className="text-xs text-amber-700 space-y-0.5">
                  {validationErrors.slice(0, 10).map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleExecute}
                disabled={loading || parsedRows.length === 0}
                className="px-4 py-2 bg-caleno-ink text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? "מייבא…" : "הרץ ייבוא"}
              </button>
              <button type="button" onClick={() => setStep(0)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm">
                חזרה
              </button>
            </div>
          </div>
        )}

        {step === 2 && executeResult && (
          <div className="rounded-xl border border-slate-200 p-8 bg-slate-50/50">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              הייבוא הושלם
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-xs text-green-700">נוצרו</p>
                <p className="text-xl font-semibold text-green-800">{executeResult.clientsCreated}</p>
              </div>
              <div className="p-4 bg-caleno-50 rounded-lg">
                <p className="text-xs text-caleno-700">עודכנו</p>
                <p className="text-xl font-semibold text-caleno-800">{executeResult.clientsUpdated}</p>
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
        )}

        <div className="mt-10 pt-8 border-t border-slate-200">
          <h3 className="text-base font-semibold text-slate-700 mb-3">דוגמת קובץ</h3>
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
        </div>
      </div>
    </div>
  );
}
