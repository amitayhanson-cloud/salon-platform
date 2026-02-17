"use client";

import { useState, useEffect, useCallback } from "react";
import type { User as FirebaseUser } from "firebase/auth";

type CustomDomainStatus = "none" | "pending" | "misconfigured" | "verified" | "error";

const STATUS_LABELS: Record<CustomDomainStatus, string> = {
  none: "",
  pending: "ממתין להגדרת DNS",
  misconfigured: "DNS לא מוגדר נכון",
  verified: "דומיין מחובר",
  error: "שגיאה",
};

type DnsRecord = { type: string; name: string; value: string };

type CustomDomainSettingsCardProps = {
  siteId: string;
  firebaseUser: FirebaseUser | null;
};

export default function CustomDomainSettingsCard({ siteId, firebaseUser }: CustomDomainSettingsCardProps) {
  const [domain, setDomain] = useState<string | null>(null);
  const [status, setStatus] = useState<CustomDomainStatus | null>(null);
  const [recordsToAdd, setRecordsToAdd] = useState<DnsRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [connectLoading, setConnectLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!firebaseUser || !siteId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/sites/${siteId}/custom-domain/status?refresh=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          domain?: string | null;
          status?: CustomDomainStatus | null;
          config?: { recordsToAdd?: DnsRecord[] };
        };
        setDomain(data.domain ?? null);
        setStatus((data.status ?? "none") as CustomDomainStatus);
        setRecordsToAdd(data.config?.recordsToAdd ?? []);
      } else {
        setDomain(null);
        setStatus("none");
        setRecordsToAdd([]);
      }
    } catch {
      setDomain(null);
      setStatus("none");
      setRecordsToAdd([]);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, siteId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    const raw = inputValue.trim();
    if (!raw || !firebaseUser) return;
    setConnectLoading(true);
    setMessage(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/sites/${siteId}/custom-domain/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ domain: raw }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        domain?: string;
        status?: string;
        dns?: { recordsToAdd?: DnsRecord[]; notes?: string[]; misconfigured?: boolean };
        error?: string;
        message?: string;
      };
      if (res.ok && data.success) {
        setDomain(data.domain ?? null);
        setStatus((data.status ?? "pending") as CustomDomainStatus);
        setRecordsToAdd(data.dns?.recordsToAdd ?? []);
        setInputValue("");
        setMessage({ type: "success", text: "הדומיין נוסף. הגדר את רשומות ה-DNS למטה." });
      } else {
        setMessage({ type: "error", text: data.message ?? data.error ?? "שגיאה בחיבור הדומיין." });
      }
    } catch {
      setMessage({ type: "error", text: "שגיאת רשת." });
    } finally {
      setConnectLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!firebaseUser) return;
    setVerifyLoading(true);
    setMessage(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/sites/${siteId}/custom-domain/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        domain?: string;
        status?: string;
        dns?: { recordsToAdd?: DnsRecord[] };
        message?: string;
      };
      if (res.ok && data.success) {
        setStatus((data.status ?? "pending") as CustomDomainStatus);
        setRecordsToAdd(data.dns?.recordsToAdd ?? []);
        setMessage(
          data.status === "verified"
            ? { type: "success", text: "הדומיין מאומת ופעיל." }
            : { type: "error", text: "ה-DNS עדיין לא מוגדר נכון. בדוק את הרשומות למטה." }
        );
      } else {
        setMessage({ type: "error", text: "אימות נכשל." });
      }
    } catch {
      setMessage({ type: "error", text: "שגיאת רשת." });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!firebaseUser) return;
    setDisconnectLoading(true);
    setMessage(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/sites/${siteId}/custom-domain/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (res.ok && data.success) {
        setDomain(null);
        setStatus("none");
        setRecordsToAdd([]);
        setMessage({ type: "success", text: "הדומיין נותק." });
      } else {
        setMessage({ type: "error", text: "נתק נכשל." });
      }
    } catch {
      setMessage({ type: "error", text: "שגיאת רשת." });
    } finally {
      setDisconnectLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setMessage({ type: "success", text: "הועתק ללוח." });
      setTimeout(() => setMessage(null), 2000);
    });
  };

  if (!firebaseUser) return null;

  const hasDomain = domain && status && status !== "none";
  const showDns = hasDomain && (status === "pending" || status === "misconfigured");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 text-right">
      <h2 className="text-lg font-bold text-slate-900 mb-4">דומיין מותאם</h2>

      {message && (
        <p
          className={`text-sm mb-4 ${message.type === "error" ? "text-red-600" : "text-emerald-600"}`}
        >
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500 text-sm">טוען…</p>
      ) : !hasDomain ? (
        <>
          <div className="mb-4">
            <label htmlFor="custom-domain-input" className="block text-sm font-medium text-slate-700 mb-2">
              דומיין (למשל mysalon.com)
            </label>
            <input
              id="custom-domain-input"
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="example.com"
              className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-caleno-500 focus:border-caleno-500 font-mono"
              dir="ltr"
            />
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connectLoading || !inputValue.trim()}
            className="px-4 py-2 rounded-lg bg-caleno-500 hover:bg-caleno-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold"
          >
            {connectLoading ? "מתחבר…" : "חבר דומיין"}
          </button>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-slate-800" dir="ltr">
              {domain}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                status === "verified"
                  ? "bg-emerald-100 text-emerald-800"
                  : status === "misconfigured" || status === "error"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-slate-100 text-slate-700"
              }`}
            >
              {STATUS_LABELS[status] || status}
            </span>
            {status === "verified" && (
              <a
                href={`https://${domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caleno-600 hover:underline text-sm"
              >
                פתח את האתר
              </a>
            )}
          </div>

          {showDns && recordsToAdd.length > 0 && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-2">הוסף את רשומות ה-DNS הבאות אצל ספק הדומיין:</p>
              <ul className="space-y-2">
                {recordsToAdd.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-sm font-mono">
                    <span className="text-slate-600">{r.type}</span>
                    <span className="text-slate-700">{r.name}</span>
                    <span className="text-slate-800">{r.value}</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(r.value)}
                      className="px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs"
                    >
                      העתק
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(status === "pending" || status === "misconfigured") && (
              <button
                type="button"
                onClick={handleVerify}
                disabled={verifyLoading}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-medium"
              >
                {verifyLoading ? "בודק…" : "אמת דומיין"}
              </button>
            )}
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnectLoading}
              className="px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 text-sm font-medium"
            >
              {disconnectLoading ? "נותק…" : "נתק דומיין"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
