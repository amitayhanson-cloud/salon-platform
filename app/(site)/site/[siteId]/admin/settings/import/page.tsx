"use client";

export const dynamic = "force-dynamic";

import { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { parseFile } from "@/lib/import/parse";
import { downloadCSVTemplate, downloadExcelTemplate, downloadExampleFile } from "@/lib/import/templates";
import { autoDetectMapping, CLIENT_IMPORT_FIELDS } from "@/lib/import/mapRow";
import { computeMappingStats } from "@/lib/import/validateMapping";
import type { RawRow, ColumnMapping, DryRunResult, ExecuteResult } from "@/lib/import/types";
import { Upload, CheckCircle, AlertCircle, Sparkles, Download } from "lucide-react";
import type { AIPreprocessResult } from "@/app/api/import/ai-preprocess/route";

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MAX_ROWS_FOR_AI = 200;
const CHUNK_SIZE = 100;
const CHUNK_THRESHOLD = 200;
const EXECUTE_TIMEOUT_MS = typeof process !== "undefined" && process.env.NODE_ENV === "development" ? 60_000 : 180_000;

function rowsToAIText(headers: string[], rows: RawRow[]): string {
  const headerLine = headers.join(" | ");
  const sampleRows = rows.slice(0, 50);
  const rowLines = sampleRows.map((r, i) => {
    const values = headers.map((h) => {
      const v = String(r[h] ?? "").trim();
      return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    });
    return `${i + 1}. ${values.join(", ")}`;
  });
  return `Headers:\n${headerLine}\n\nRows:\n${rowLines.join("\n")}`;
}

function isMappingConfident(stats: { phoneMapped: boolean; nameMapped: boolean; validPhoneRatio: number }): boolean {
  return stats.phoneMapped && stats.nameMapped && stats.validPhoneRatio >= 0.3;
}

function AIOptionalButton({
  headers,
  rows,
  onRun,
  firebaseUser,
}: {
  headers: string[];
  rows: RawRow[];
  onRun: (result: AIPreprocessResult) => void;
  firebaseUser: { getIdToken: () => Promise<string> } | null;
}) {
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIPreprocessResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const runAI = useCallback(async () => {
    if (!headers.length || !rows.length || !firebaseUser) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const textForAI = rowsToAIText(headers, rows.slice(0, MAX_ROWS_FOR_AI));
      const res = await fetch("/api/import/ai-preprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          textBlock: textForAI,
          headers,
          rows: rows.slice(0, MAX_ROWS_FOR_AI),
          originalRowCount: rows.length,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || res.statusText);
      }
      const data: AIPreprocessResult = await res.json();
      setAiResult(data);
    } catch (err) {
      console.error("[import] AI error:", err);
      setAiError(err instanceof Error ? err.message : "שגיאת AI");
    } finally {
      setAiLoading(false);
    }
  }, [headers, rows, firebaseUser]);

  if (aiResult) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm font-medium text-green-800 mb-2">AI סיים: {aiResult.cleanedRowCount} שורות תקינות</p>
        <p className="text-xs text-green-700 mb-3">מקור: {aiResult.originalRowCount} | הוסרו: {aiResult.droppedRowsCount}</p>
        <button type="button" onClick={() => onRun(aiResult)} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">
          המשך לייבוא
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={runAI}
        disabled={aiLoading}
        className="flex items-center gap-2 px-4 py-2 border border-violet-300 rounded-lg text-violet-700 text-sm hover:bg-violet-50"
      >
        <Sparkles className="w-4 h-4" />
        {aiLoading ? "מעבד..." : "נסה לתקן עם AI"}
      </button>
      {aiError && <p className="text-xs text-red-600">{aiError}</p>}
    </div>
  );
}

export default function ImportPage() {
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string;
  const { firebaseUser } = useAuth();
  const basePath = siteId && siteId !== "me" ? `/site/${siteId}/admin` : "/site/me/admin";

  const [step, setStep] = useState<Step>(0);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | undefined>();
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forceProceed, setForceProceed] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [executeProgress, setExecuteProgress] = useState<{ done: number; total: number } | null>(null);
  const [parsedPreview, setParsedPreview] = useState<{
    headers: string[];
    rows: RawRow[];
    sheetName?: string;
  } | null>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || loading) return;
    setError(null);
    setParseError(null);
    setParsedPreview(null);
    setFile(f);
    setLoading(true);
    (e.target as HTMLInputElement).value = "";

    try {
      const result = await parseFile(f);
      if (result.errors.length) {
        if (result.rows.length === 0 && result.headers.length === 0) {
          setParseError(result.errors[0] ?? "לא הצלחנו לקרוא את הקובץ");
        } else {
          setError(result.errors.join("; "));
        }
      }
      setParsedPreview({
        headers: result.headers,
        rows: result.rows,
        sheetName: result.sheetName,
      });
      setHeaders(result.headers);
      setRows(result.rows);
      setSheetName(result.sheetName);
      setMapping(autoDetectMapping(result.headers));

      if (result.rows.length === 0) {
        setParseError("אין שורות נתונים בקובץ");
      }
      setStep(1);
    } catch (err) {
      console.error("[import] Parse error:", err);
      setParseError("לא הצלחנו לקרוא את הקובץ");
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleAIApprove = useCallback((result: AIPreprocessResult) => {
    const rawRows: RawRow[] = result.normalizedRows.map((r) => ({
      fullName: r.fullName,
      phone: r.phone,
      email: r.email ?? "",
      notes: r.notes ?? "",
    }));
    setRows(rawRows);
    setHeaders(result.normalizedHeaders);
    setMapping(autoDetectMapping(result.normalizedHeaders));
    setParsedPreview({ headers: result.normalizedHeaders, rows: rawRows });
    setStep(2);
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
      setStep(5);
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
    setExecuteProgress(null);

    const stage = { current: "execute" as "upload" | "dryRun" | "execute" | "done" | "error" };
    const debugLog = (msg: string, extra?: unknown) => {
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        console.log("[import/execute]", stage.current, msg, extra ?? "");
      }
    };

    try {
      debugLog("execute starts", { rowsLength: rows.length });
      const token = await firebaseUser.getIdToken();

      const chunks: RawRow[][] =
        rows.length > CHUNK_THRESHOLD
          ? Array.from({ length: Math.ceil(rows.length / CHUNK_SIZE) }, (_, i) =>
              rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
            )
          : [rows];

      const aggregated: ExecuteResult = {
        clientsCreated: 0,
        clientsUpdated: 0,
        bookingsCreated: 0,
        bookingsSkipped: 0,
        bookingsFailed: 0,
        errors: [],
      };

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const doneBefore = i * CHUNK_SIZE;
        const doneAfter = Math.min(doneBefore + chunk.length, rows.length);
        setExecuteProgress({ done: doneAfter, total: rows.length });
        debugLog("fetch chunk", { chunkIndex: i + 1, totalChunks: chunks.length, chunkRows: chunk.length });

        const fetchPromise = fetch("/api/import/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ siteId, rows: chunk, mapping, skipRowsWithErrors: true }),
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), EXECUTE_TIMEOUT_MS)
        );

        const res = await Promise.race([fetchPromise, timeoutPromise]);
        debugLog("fetch resolved", { status: res.status });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { error?: string }).error || res.statusText);
        }

        const data = (await res.json()) as ExecuteResult & { ok?: boolean };
        debugLog("response parsed", { ok: data.ok, created: data.clientsCreated, updated: data.clientsUpdated });

        aggregated.clientsCreated += data.clientsCreated ?? 0;
        aggregated.clientsUpdated += data.clientsUpdated ?? 0;
        aggregated.bookingsCreated += data.bookingsCreated ?? 0;
        aggregated.bookingsSkipped += data.bookingsSkipped ?? 0;
        aggregated.bookingsFailed += data.bookingsFailed ?? 0;
        if (Array.isArray(data.errors)) {
          const offset = doneBefore;
          aggregated.errors.push(...data.errors.map((e) => ({ ...e, row: e.row + offset })));
        }
      }

      stage.current = "done";
      setExecuteResult(aggregated);
      setStep(6);
    } catch (err) {
      stage.current = "error";
      debugLog("error", err);
      if (err instanceof Error && err.message === "timeout") {
        setError("הייבוא לוקח יותר מדי זמן — בדוק לוגים");
      } else {
        setError(err instanceof Error ? err.message : "Import failed");
      }
    } finally {
      setLoading(false);
      setExecuteProgress(null);
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
    name: "שם",
    phone: "טלפון",
    email: "אימייל",
    notes: "הערות",
  };

  const stats = parsedPreview ? computeMappingStats(parsedPreview.rows, mapping) : null;
  const mappingConfident = stats ? isMappingConfident(stats) : false;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">ייבוא לקוחות (CSV / Excel)</h1>
        {step === 0 ? (
          <Link href={`${basePath}/settings`} className="text-sm text-sky-600 hover:text-sky-800">
            ← חזרה להגדרות
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="text-sm text-sky-600 hover:text-sky-800"
          >
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
        {([0, 1, 2, 3, 4, 5, 6] as Step[]).map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded ${step >= s ? "bg-sky-500" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {/* Step 0: Upload entry (main) + Templates (secondary) */}
      {step === 0 && (
        <>
          {/* Main section: Upload / Import entry */}
          <div className="bg-white rounded-xl border border-slate-200 p-8 mb-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">ייבוא קובץ CSV</h2>
            <p className="text-sm text-slate-600 mb-4">
              העלה קובץ CSV או Excel עם נתוני לקוחות. המערכת תזהה אוטומטית עמודות שם וטלפון.
            </p>
            <p className="text-xs font-medium text-slate-500 mb-2">עמודות נדרשות:</p>
            <div className="flex flex-wrap gap-2 mb-6">
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-sm font-medium">
                שם (fullName)
              </span>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-sm font-medium">
                טלפון (phone)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium"
            >
              <Upload className="w-5 h-5" />
              העלה קובץ לייבוא
            </button>
          </div>

          {/* Secondary section: Templates / Examples */}
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-700 mb-2">דוגמאות ותבניות להורדה</h3>
            <p className="text-sm text-slate-500 mb-4">
              השתמשו בתבנית כדי לוודא שהעמודות תואמות.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={downloadCSVTemplate}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                הורד תבנית CSV
              </button>
              <button
                type="button"
                onClick={downloadExcelTemplate}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                הורד תבנית Excel
              </button>
              <button
                type="button"
                onClick={downloadExampleFile}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 text-sm hover:bg-slate-50"
              >
                <Download className="w-4 h-4" />
                הורד קובץ דוגמה מלא
              </button>
            </div>
          </div>
        </>
      )}

      {/* Step 1: Upload + raw preview */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">העלאת קובץ</h2>
          <p className="text-sm text-slate-600 mb-4">
            העלה קובץ CSV או Excel (.xlsx). אם השתמשת בתבנית – המיפוי יותאם אוטומטית.
          </p>

          {!parsedPreview ? (
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
              <Upload className="w-10 h-10 text-slate-400 mb-2" />
              <span className="text-sm text-slate-600">לחץ לבחירת קובץ או גרור לכאן</span>
              <span className="text-xs text-slate-500 mt-1">.csv או .xlsx</span>
              <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
            </label>
          ) : null}

          {loading && (
            <div className="mt-4 flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
              <span className="text-sm text-slate-500">טוען קובץ…</span>
            </div>
          )}

          {parseError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{parseError}</p>
            </div>
          )}

          {parsedPreview && (
            <>
              <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-medium text-slate-600 mb-2">תצוגה מקדימה (מה שפותח)</p>
                {parsedPreview.sheetName && (
                  <p className="text-xs text-slate-500 mb-1">גיליון: {parsedPreview.sheetName}</p>
                )}
                <p className="text-xs text-slate-500 mb-2">
                  כותרות (8 ראשונות): {parsedPreview.headers.slice(0, 8).join(" | ")}
                </p>
                <p className="text-xs text-slate-500 mb-3">שורות: {parsedPreview.rows.length}</p>
                <div className="overflow-x-auto max-h-48 border border-slate-200 rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-2 py-1 text-right border-b">#</th>
                        {parsedPreview.headers.slice(0, 8).map((h) => (
                          <th key={h} className="px-2 py-1 text-right border-b">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedPreview.rows.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-b border-slate-100">
                          <td className="px-2 py-1">{i + 1}</td>
                          {parsedPreview.headers.slice(0, 8).map((h) => (
                            <td key={h} className="px-2 py-1 max-w-[100px] truncate">
                              {row[h] ?? ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {parsedPreview.rows.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-3 items-center">
                  {mappingConfident ? (
                    <button type="button" onClick={() => setStep(2)} className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium">
                      המשך
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setStep(2)} className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium">
                        מיפוי ידני
                      </button>
                      <AIOptionalButton headers={headers} rows={rows} onRun={handleAIApprove} firebaseUser={firebaseUser ?? null} />
                    </>
                  )}
                  <button type="button" onClick={() => setStep(0)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm">
                    חזרה
                  </button>
                  <label className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm cursor-pointer">
                    החלף קובץ
                    <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
                  </label>
                </div>
              ) : (
                <p className="mt-4 text-sm text-amber-700">אין שורות נתונים בקובץ. נסה קובץ אחר.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">מיפוי עמודות</h2>
          <p className="text-sm text-slate-600 mb-6">התאם את העמודות לשם וטלפון. טלפון חובה.</p>
          <div className="space-y-3">
            {CLIENT_IMPORT_FIELDS.map((field) => (
              <div key={field} className="flex items-center gap-4">
                <label className="w-40 text-sm font-medium text-slate-700">
                  {fieldLabels[field] ?? field}
                  {field === "phone" && " *"}
                </label>
                <select
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  value={mapping[field] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                >
                  <option value="">— לא למפות —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!mapping.phone?.trim() && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">יש למפות עמודת טלפון (חובה) לפני ההמשך.</p>
            </div>
          )}
          <div className="mt-8 flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm">
              חזרה
            </button>
            <button
              type="button"
              onClick={() => { setStep(3); setForceProceed(false); }}
              disabled={!mapping.phone?.trim()}
              className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              המשך לתצוגה מקדימה
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (() => {
        const stats = computeMappingStats(rows, mapping);
        const phoneCol = mapping.phone || mapping.customerPhone || "";
        const nameCol = mapping.name || mapping.customerName || "";
        const canProceed = stats.phoneMapped && (stats.validPhoneRatio >= 0.3 || forceProceed);
        const showBlockingWarning = stats.phoneMapped && stats.totalRows > 0 && stats.validPhoneRatio < 0.3 && !forceProceed;
        const showLowValidityWarning = stats.phoneMapped && stats.totalRows > 0 && stats.validPhoneRatio < 0.7 && stats.validPhoneRatio >= 0.3;
        const mappedCols = [...new Set([phoneCol, nameCol].filter(Boolean))];
        const previewHeaders = [...mappedCols, ...headers.filter((h) => !mappedCols.includes(h)).slice(0, 6)];

        return (
          <div className="bg-white rounded-xl border border-slate-200 p-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">תצוגה מקדימה</h2>
            <p className="text-sm text-slate-600 mb-4">{rows.length} שורות. הרץ בדיקה יבשה (ללא שמירה) כדי לראות סיכום.</p>
            {phoneCol && nameCol && (
              <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <p className="text-xs font-medium text-slate-600 mb-2">מיפוי: טלפון ← {phoneCol} | שם ← {nameCol}</p>
              </div>
            )}
            {!stats.phoneMapped && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-700">יש למפות עמודת טלפון.</p>
              </div>
            )}
            {showBlockingWarning && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-700 font-medium">
                    נראה שמיפוי שגוי: רק {stats.validPhoneCount} מתוך {stats.totalRows} שורות מכילות טלפון תקין.
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={forceProceed} onChange={(e) => setForceProceed(e.target.checked)} className="rounded border-slate-300" />
                  <span className="text-sm text-red-800">אני מבין, המשך בכל זאת</span>
                </label>
              </div>
            )}
            {showLowValidityWarning && !showBlockingWarning && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                <p className="text-sm text-amber-800">
                  רק {stats.validPhoneCount} מתוך {stats.totalRows} שורות מכילות טלפון תקין ({Math.round(stats.validPhoneRatio * 100)}%).
                </p>
              </div>
            )}
            <div className="overflow-x-auto max-h-60 border border-slate-200 rounded-lg mb-6">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-right border-b">#</th>
                    {previewHeaders.map((h) => (
                      <th key={h} className="px-2 py-1 text-right border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="px-2 py-1">{i + 1}</td>
                      {previewHeaders.map((h) => (
                        <td key={h} className="px-2 py-1 max-w-[120px] truncate">{row[h] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <p className="text-xs text-slate-500 p-2">... ועוד {rows.length - 20} שורות</p>}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep(2)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm">חזרה</button>
              <button
                type="button"
                onClick={handleDryRun}
                disabled={loading || !canProceed}
                className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? "בודק..." : "המשך לתצוגה סופית"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Step 4: (unused, step 5 is dry-run) */}

      {/* Step 5: Final Preview before Execute */}
      {step === 5 && dryRunResult && (
        <div className="bg-white rounded-xl border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">תצוגה סופית לפני ייבוא</h2>
          <p className="text-sm text-slate-600 mb-6">זוהי התצוגה המדויקת של מה שיישמר. ודא שהטלפונים מנורמלים נכון (עם 0 בתחילת מספר נייד).</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">לקוחות חדשים/יעודכנו</p>
              <p className="text-xl font-semibold">{dryRunResult.clientsToCreate}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500">תורים שיווצרו</p>
              <p className="text-xl font-semibold">{dryRunResult.bookingsToCreate ?? 0}</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <p className="text-xs text-amber-700">שורות שידולגו (שגיאות)</p>
              <p className="text-xl font-semibold text-amber-800">{dryRunResult.droppedRowCount ?? dryRunResult.errors.length}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-xs text-red-600">שגיאות</p>
              <p className="text-xl font-semibold text-red-700">{dryRunResult.errors.length}</p>
            </div>
          </div>

          {dryRunResult.previewRows && dryRunResult.previewRows.length > 0 && (
            <div className="mb-6">
              <p className="text-sm font-medium text-slate-700 mb-2">תצוגה מקדימה (עד 50 שורות ראשונות, מנורמל)</p>
              <div className="overflow-x-auto max-h-64 border border-slate-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-right border-b">#</th>
                      <th className="px-2 py-1 text-right border-b">שם</th>
                      <th className="px-2 py-1 text-right border-b">טלפון (מנורמל)</th>
                      <th className="px-2 py-1 text-right border-b">אימייל</th>
                      <th className="px-2 py-1 text-right border-b">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRunResult.previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1">{i + 1}</td>
                        <td className="px-2 py-1 max-w-[120px] truncate">{row.fullName}</td>
                        <td className="px-2 py-1 font-mono text-xs">{row.phone}</td>
                        <td className="px-2 py-1 max-w-[100px] truncate">{row.email ?? ""}</td>
                        <td className="px-2 py-1 max-w-[100px] truncate">{row.notes ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {dryRunResult.warnings && dryRunResult.warnings.length > 0 && (
            <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-2">אזהרות:</p>
              <ul className="text-sm text-amber-700 space-y-1">
                {dryRunResult.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}
          {dryRunResult.errors.length > 0 && (
            <div className="mb-6 max-h-40 overflow-y-auto border border-red-100 rounded-lg p-3">
              <p className="text-sm font-medium text-red-800 mb-2">פרטי שגיאות:</p>
              <ul className="text-sm text-red-700 space-y-1">
                {dryRunResult.errors.slice(0, 30).map((e, i) => (
                  <li key={i}>שורה {e.row}: {e.message}</li>
                ))}
                {dryRunResult.errors.length > 30 && <li>... ועוד {dryRunResult.errors.length - 30} שגיאות</li>}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(2)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm">חזרה למיפוי</button>
            <button
              type="button"
              onClick={handleExecute}
              disabled={loading || dryRunResult.clientsToCreate === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent ml-2" />
                  {executeProgress ? `מייבא ${executeProgress.done}/${executeProgress.total}…` : "מייבא…"}
                </>
              ) : (
                "אשר וייבא"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 6: Report */}
      {step === 6 && executeResult && (
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
            <div className="p-4 bg-red-50 rounded-lg col-span-2">
              <p className="text-xs text-red-600">שגיאות</p>
              <p className="text-xl font-semibold text-red-700">{executeResult.errors.length}</p>
            </div>
          </div>
          {executeResult.errors.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-red-800">שגיאות ({executeResult.errors.length})</p>
                <button type="button" onClick={downloadErrorCsv} className="text-sm text-sky-600 hover:text-sky-800">הורד CSV שגיאות</button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-red-100 rounded-lg p-3">
                <ul className="text-sm text-red-700 space-y-1">
                  {executeResult.errors.slice(0, 30).map((e, i) => (
                    <li key={i}>שורה {e.row}: {e.message}</li>
                  ))}
                  {executeResult.errors.length > 30 && <li>... ועוד {executeResult.errors.length - 30}</li>}
                </ul>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Link href={`${basePath}/settings`} className="px-4 py-2 bg-sky-500 text-white rounded-lg text-sm font-medium">סיום</Link>
            <button
              type="button"
              onClick={() => { setStep(0); setFile(null); setRows([]); setHeaders([]); setParsedPreview(null); setDryRunResult(null); setExecuteResult(null); setParseError(null); }}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm"
            >
              ייבוא נוסף
            </button>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">ייבוא לקוחות בלבד (שם + טלפון). לקוחות קיימים מתעדכנים לפי טלפון.</p>
    </div>
  );
}
