"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  WAITLIST_EXPIRED_BODY_LINE1,
  WAITLIST_EXPIRED_CTA_LINE,
} from "@/lib/bookingWaitlist/waitlistOfferMessages";

type GateState =
  | "loading"
  | "invalid"
  | "used"
  | "expired"
  | "active"
  | "confirming"
  | "booked"
  | "error";

type GatePayload = {
  state: string;
  salonName: string;
  phoneDisplay: string | null;
  telHref: string | null;
  whatsappHref: string | null;
  offerSummary?: { dateYmd: string; timeHHmm: string; serviceName: string };
};

export default function WaitlistOfferPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const siteId = typeof params?.siteId === "string" ? params.siteId : "";
  const entryId = typeof params?.entryId === "string" ? params.entryId : "";
  const token = searchParams.get("t")?.trim() ?? "";

  const [ui, setUi] = useState<{
    state: GateState;
    payload: GatePayload | null;
    message: string | null;
  }>({ state: "loading", payload: null, message: null });

  const load = useCallback(async () => {
    if (!siteId || !entryId || !token) {
      setUi({ state: "invalid", payload: null, message: "קישור לא תקין." });
      return;
    }
    try {
      const res = await fetch(
        `/api/booking-waitlist/offer-gate?siteId=${encodeURIComponent(siteId)}&entryId=${encodeURIComponent(entryId)}&t=${encodeURIComponent(token)}`
      );
      const data = (await res.json().catch(() => null)) as GatePayload & { ok?: boolean; error?: string };
      if (!data || data.ok === false) {
        setUi({ state: "error", payload: null, message: "לא ניתן לטעון את ההצעה." });
        return;
      }
      const st = data.state as GateState;
      if (st === "invalid") {
        setUi({ state: "invalid", payload: data, message: "קישור לא תקין או שפג תוקפו." });
        return;
      }
      if (st === "used") {
        setUi({ state: "used", payload: data, message: "ההצעה כבר טופלה." });
        return;
      }
      if (st === "expired") {
        setUi({ state: "expired", payload: data, message: null });
        return;
      }
      if (st === "active") {
        setUi({ state: "active", payload: data, message: null });
        return;
      }
      setUi({ state: "error", payload: data, message: "מצב לא צפוי." });
    } catch {
      setUi({ state: "error", payload: null, message: "שגיאת רשת." });
    }
  }, [siteId, entryId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    if (!siteId || !entryId || !token) return;
    setUi((s) => ({ ...s, state: "confirming" }));
    try {
      const res = await fetch("/api/booking-waitlist/confirm-offer-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, entryId, token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setUi((s) => ({ ...s, state: "booked", message: "התור נקבע בהצלחה." }));
        return;
      }
      if (res.status === 410) {
        await load();
        return;
      }
      setUi((s) => ({
        ...s,
        state: "error",
        message: typeof data.message === "string" ? data.message : "לא ניתן להשלים את ההזמנה.",
      }));
    } catch {
      setUi((s) => ({ ...s, state: "error", message: "שגיאת רשת." }));
    }
  };

  const p = ui.payload;
  const salon = p?.salonName ?? "העסק";

  return (
    <div dir="rtl" lang="he" className="min-h-[70vh] bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        {ui.state === "loading" && <p className="text-center text-slate-600">טוענים…</p>}

        {ui.state === "expired" && (
          <div className="space-y-5 text-center">
            <h1 className="text-xl font-bold text-slate-900">ההצעה פגה</h1>
            <p className="text-base leading-relaxed text-slate-700">{WAITLIST_EXPIRED_BODY_LINE1}</p>
            <p className="text-base leading-relaxed text-slate-700">{WAITLIST_EXPIRED_CTA_LINE}</p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-center">
              {p?.whatsappHref ? (
                <a
                  href={p.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  WhatsApp ל{salon}
                </a>
              ) : null}
              {p?.telHref ? (
                <a
                  href={p.telHref}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {p.phoneDisplay ? `התקשרו: ${p.phoneDisplay}` : "התקשרו לעסק"}
                </a>
              ) : null}
            </div>
            {!p?.whatsappHref && !p?.telHref ? (
              <p className="text-sm text-slate-500">פרטי קשר יעודכנו בקרוב באתר העסק.</p>
            ) : null}
          </div>
        )}

        {(ui.state === "invalid" || ui.state === "used" || ui.state === "error") && (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-bold text-slate-900">
              {ui.state === "used" ? "כבר טופל" : "לא ניתן להמשיך"}
            </h1>
            <p className="text-slate-700">{ui.message}</p>
          </div>
        )}

        {ui.state === "active" && p?.offerSummary && (
          <div className="space-y-5 text-center">
            <h1 className="text-xl font-bold text-slate-900">תור פנוי מרשימת המתנה</h1>
            <p className="text-slate-700">
              {p.offerSummary.serviceName} — {p.offerSummary.dateYmd} בשעה {p.offerSummary.timeHHmm}
            </p>
            <p className="text-sm text-slate-500">(הודעה זו בתוקף לשעתיים בלבד)</p>
            <button
              type="button"
              onClick={() => void confirm()}
              className="w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              אשרו והזמינו את התור
            </button>
          </div>
        )}

        {ui.state === "confirming" && <p className="text-center text-slate-600">מאשרים…</p>}

        {ui.state === "booked" && (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-bold text-emerald-800">נרשמתם</h1>
            <p className="text-slate-700">{ui.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
