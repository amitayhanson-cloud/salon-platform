"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import AdminTabs from "@/components/ui/AdminTabs";
import { subscribeClientStatusSettings } from "@/lib/firestoreClientSettings";
import { subscribeWhatsAppSettings } from "@/lib/firestoreWhatsAppSettings";
import { renderWhatsAppTemplate, reminderTemplateHasRequiredTime } from "@/lib/whatsapp/templateRender";
import { REMINDER_REQUIRED_PLACEHOLDER } from "@/types/whatsappSettings";
import type { WhatsAppSettingsDoc } from "@/types/whatsappSettings";
import type { ManualClientTag } from "@/types/clientStatus";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";
import { MAX_BROADCAST_RECIPIENTS, type BroadcastAutomatedStatus } from "@/lib/whatsapp/broadcastConstants";
import {
  getClientsForBroadcastPicker,
  type ClientBroadcastPickerRow,
} from "@/lib/firestoreClients";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import { getPublicBookingPageUrlForSiteClient } from "@/lib/url";

const TABS = [
  { key: "broadcast" as const, label: "שליחת הודעה קבוצתית" },
  { key: "automations" as const, label: "אוטומציות" },
];

const STATUS_OPTIONS: { value: BroadcastAutomatedStatus; label: string }[] = [
  { value: "new", label: "חדש" },
  { value: "active", label: "פעיל" },
  { value: "sleeping", label: "רדום" },
];

const BROADCAST_INSERT_TAGS = [
  { key: "{שם_לקוח}", label: "שם לקוח" },
  { key: "{שם_העסק}", label: "שם העסק" },
  { key: "{קישור_לתיאום}", label: "קישור לתיאום" },
] as const;

const REMINDER_INSERT_TAGS = [
  ...BROADCAST_INSERT_TAGS,
  { key: "{תאריך_תור}", label: "תאריך תור" },
  { key: "{זמן_תור}", label: "שעת תור" },
  { key: "{reminder_waze_block}", label: "בלוק וויז (תזכורת)" },
  { key: "{waze_link}", label: "קישור וויז" },
] as const;

function insertAtCursor(
  el: HTMLTextAreaElement | null,
  chunk: string,
  value: string,
  setValue: (v: string) => void
) {
  if (!el) {
    setValue(value + chunk);
    return;
  }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + chunk + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + chunk.length;
    el.setSelectionRange(pos, pos);
  });
}

function PhonePreview({ text }: { text: string }) {
  const preview = text.trim() || "ההודעה תופיע כאן…";
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div
        className="rounded-[2.25rem] border-[10px] border-[#1e293b] bg-[#1e293b] shadow-[0_24px_48px_-12px_rgba(15,23,42,0.45)] overflow-hidden"
        dir="rtl"
      >
        <div className="h-7 bg-[#0f172a] flex items-center justify-center gap-1.5 pt-1">
          <span className="h-2 w-12 rounded-full bg-[#334155]" />
        </div>
        <div
          className="min-h-[420px] bg-[#e5ddd5] px-3 py-4"
          style={{
            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 20px)",
          }}
        >
          <div className="flex justify-end">
            <div
              className="max-w-[92%] rounded-2xl rounded-tr-md px-3.5 py-2.5 text-sm leading-relaxed text-[#0f172a] shadow-md"
              style={{
                background: "linear-gradient(180deg, #d9fdd3 0%, #c8f7c5 100%)",
                boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
              }}
            >
              <p className="whitespace-pre-wrap break-words">{preview}</p>
              <div className="mt-1 flex justify-end">
                <span className="text-[10px] text-[#667781]">12:00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-[#64748B]">תצוגה לדוגמה — לא נשלחה הודעה</p>
    </div>
  );
}

export default function AdminWhatsAppPage() {
  const params = useParams();
  const siteId = params.siteId as string;
  const { firebaseUser } = useAuth();
  const unsavedCtx = useUnsavedChanges();

  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("broadcast");

  const [manualTags, setManualTags] = useState<ManualClientTag[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<BroadcastAutomatedStatus[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [clientRows, setClientRows] = useState<ClientBroadcastPickerRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsLoadError, setClientsLoadError] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  /** Live preview: real salon name + booking URL from site config */
  const [previewSalonName, setPreviewSalonName] = useState("");
  const [previewTenantSlug, setPreviewTenantSlug] = useState<string | null>(null);
  const broadcastRef = useRef<HTMLTextAreaElement>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const [autoDirty, setAutoDirty] = useState(false);
  const autoDirtyRef = useRef(false);
  useEffect(() => {
    autoDirtyRef.current = autoDirty;
  }, [autoDirty]);

  const [localSettings, setLocalSettings] = useState<WhatsAppSettingsDoc | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const confirmRef = useRef<HTMLTextAreaElement>(null);
  const reminderRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (tab !== "broadcast" || !siteId) return;
    let cancelled = false;
    setClientsLoading(true);
    setClientsLoadError(null);
    getClientsForBroadcastPicker(siteId)
      .then((rows) => {
        if (!cancelled) setClientRows(rows);
      })
      .catch(() => {
        if (!cancelled) setClientsLoadError("לא ניתן לטעון את רשימת הלקוחות");
      })
      .finally(() => {
        if (!cancelled) setClientsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, siteId]);

  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeSiteConfig(
      siteId,
      (cfg) => {
        setPreviewSalonName(cfg?.salonName?.trim() || "");
        const s = cfg?.slug;
        setPreviewTenantSlug(typeof s === "string" && s.trim() ? s.trim() : null);
      },
      () => {}
    );
    return unsub;
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    const unsub = subscribeClientStatusSettings(
      siteId,
      (s) => setManualTags(s.manualTags ?? []),
      () => {}
    );
    return unsub;
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    setSettingsLoading(true);
    const unsub = subscribeWhatsAppSettings(
      siteId,
      (s) => {
        setSettingsLoading(false);
        setLocalSettings((prev) => {
          if (autoDirtyRef.current && prev) return prev;
          return s;
        });
      },
      () => setSettingsLoading(false)
    );
    return unsub;
  }, [siteId]);

  const previewBookingUrl = useMemo(
    () => getPublicBookingPageUrlForSiteClient(siteId || "", previewTenantSlug),
    [siteId, previewTenantSlug]
  );

  const previewSample = renderWhatsAppTemplate(broadcastMessage, {
    שם_לקוח: "ישראל ישראלי",
    שם_העסק: previewSalonName || "שם העסק",
    קישור_לתיאום: previewBookingUrl,
  });

  const toggleStatus = (v: BroadcastAutomatedStatus) => {
    setSelectedStatuses((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleClientRow = (id: string) => {
    setSelectedClientIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_BROADCAST_RECIPIENTS) return prev;
      return [...prev, id];
    });
  };

  const filteredClientRows = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clientRows;
    return clientRows.filter((r) => {
      const name = r.name.toLowerCase();
      const phone = r.phone.replace(/\s|-/g, "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [clientRows, clientSearch]);

  const filtersValid =
    selectedStatuses.length > 0 || selectedTagIds.length > 0 || selectedClientIds.length > 0;

  const getToken = useCallback(async () => {
    if (!firebaseUser) throw new Error("לא מחוברים");
    return firebaseUser.getIdToken();
  }, [firebaseUser]);

  const openReview = async () => {
    setReviewError(null);
    setSendResult(null);
    if (!filtersValid) {
      setReviewError("בחרו לפחות סטטוס אוטומטי, תג ידני, או לקוחות ספציפיים מהרשימה.");
      return;
    }
    if (!broadcastMessage.trim()) {
      setReviewError("כתבו את תוכן ההודעה.");
      return;
    }
    setReviewLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/whatsapp/broadcast/count`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          statuses: selectedStatuses,
          tagIds: selectedTagIds,
          clientIds: selectedClientIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setReviewCount(typeof data.count === "number" ? data.count : 0);
      setReviewOpen(true);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setReviewLoading(false);
    }
  };

  const confirmSend = async () => {
    if (reviewCount === null || reviewCount === 0) return;
    if (reviewCount > MAX_BROADCAST_RECIPIENTS) {
      setReviewError(`מקסימום ${MAX_BROADCAST_RECIPIENTS} נמענים לשליחה אחת. צמצמו מסננים.`);
      return;
    }
    setSendLoading(true);
    setReviewError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/whatsapp/broadcast/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          statuses: selectedStatuses,
          tagIds: selectedTagIds,
          clientIds: selectedClientIds,
          message: broadcastMessage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "שגיאת שליחה");
      setSendResult(`נשלחו ${data.sent} הודעות${data.failed ? `, ${data.failed} נכשלו` : ""}.`);
      setReviewOpen(false);
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : "שגיאת שליחה");
    } finally {
      setSendLoading(false);
    }
  };

  const saveAutomations = useCallback(async () => {
    if (!localSettings || !siteId) return;
    setSaveError(null);
    setSaveOk(false);
    if (!reminderTemplateHasRequiredTime(localSettings.reminderTemplate)) {
      setSaveError(`בתבנית התזכורת חובה לכלול את התג ${REMINDER_REQUIRED_PLACEHOLDER}`);
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/whatsapp/settings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(localSettings),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "שמירה נכשלה");
      setAutoDirty(false);
      if (data.settings) setLocalSettings(data.settings);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 4000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "שמירה נכשלה");
    } finally {
      setSaving(false);
    }
  }, [getToken, localSettings, siteId]);

  useEffect(() => {
    if (!unsavedCtx) return;
    unsavedCtx.setUnsaved(autoDirty, saveAutomations);
  }, [unsavedCtx, saveAutomations, autoDirty]);

  const updateLocal = (patch: Partial<WhatsAppSettingsDoc>) => {
    setAutoDirty(true);
    setLocalSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (settingsLoading || !localSettings) {
    return (
      <div dir="rtl" className="max-w-5xl mx-auto px-4 py-16 text-center text-[#64748B]">
        טוען הגדרות WhatsApp…
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <AdminPageHero
        title="מרכז הודעות WhatsApp"
        subtitle="תקשורת עסקית פרימיום — הודעות קבוצתיות ואוטומציות דרך Twilio"
        pills={["Premium", "WhatsApp"]}
        glass
      >
        <div className="mt-4 flex items-center gap-2 text-sm text-[#64748B]">
          <MessageSquare className="w-4 h-4 text-[#1E6F7C]" aria-hidden />
          <span>השליחה מתבצעת דרך האינטגרציה הקיימת עם Twilio</span>
        </div>
      </AdminPageHero>

      <AdminTabs tabs={TABS} activeKey={tab} onChange={setTab} />

      {tab === "broadcast" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(260px,320px)] items-start">
          <div className="space-y-6">
            <AdminCard className="p-6">
              <h2 className="text-lg font-semibold text-[#0F172A] mb-1">מסנני נמענים</h2>
              <p className="text-sm text-[#64748B] mb-4">
                בחרו לפחות אחד: סטטוס אוטומטי, תג ידני, או לקוחות ספציפיים. עבור סטטוס+תג — נדרשים לעמוד בשניהם
                (וגם). לקוחות שנבחרו בשם מתווספים כאיחוד ללא כפילויות.
              </p>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-[#0F172A] mb-2">סטטוס אוטומטי</p>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => toggleStatus(o.value)}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          selectedStatuses.includes(o.value)
                            ? "bg-[#1E6F7C] text-white shadow-sm"
                            : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F172A] mb-2">תגים ידניים</p>
                  {manualTags.length === 0 ? (
                    <p className="text-sm text-[#94A3B8]">אין תגים — הגדירו תחת הגדרות לקוחות</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {manualTags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTag(t.id)}
                          className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                            selectedTagIds.includes(t.id)
                              ? "bg-[#0d9488] text-white shadow-sm"
                              : "bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0F172A] mb-2">לקוחות לפי שם (יחידים)</p>
                  <p className="text-xs text-[#64748B] mb-2">
                    חיפוש לפי שם או מספר טלפון. לחיצה על שורה מוסיפה או מסירה מהשליחה.
                    {selectedClientIds.length > 0 && (
                      <span className="font-medium text-[#1E6F7C]">
                        {" "}
                        נבחרו {selectedClientIds.length} לקוחות
                        {selectedClientIds.length >= MAX_BROADCAST_RECIPIENTS ? " (הגעתם למגבלה)" : ""}.
                      </span>
                    )}
                  </p>
                  <input
                    type="search"
                    dir="rtl"
                    className="mb-2 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30"
                    placeholder="חיפוש לפי שם או טלפון…"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                  />
                  {clientsLoadError && (
                    <p className="text-sm text-red-600 mb-2">{clientsLoadError}</p>
                  )}
                  {clientsLoading ? (
                    <p className="text-sm text-[#64748B] py-4 text-center">טוען לקוחות…</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] divide-y divide-[#E2E8F0]">
                      {filteredClientRows.length === 0 ? (
                        <p className="p-4 text-sm text-[#94A3B8] text-center">לא נמצאו לקוחות</p>
                      ) : (
                        filteredClientRows.map((row) => {
                          const selected = selectedClientIds.includes(row.id);
                          return (
                            <button
                              key={row.id}
                              type="button"
                              onClick={() => toggleClientRow(row.id)}
                              className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm transition-colors ${
                                selected
                                  ? "bg-[#cceef1]/80 text-[#0F172A]"
                                  : "bg-white hover:bg-[#F1F5F9] text-[#334155]"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                              <span className="shrink-0 text-xs text-[#64748B] tabular-nums" dir="ltr">
                                {row.phone}
                              </span>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                                  selected ? "bg-[#1E6F7C] text-white" : "bg-[#E2E8F0] text-[#64748B]"
                                }`}
                              >
                                {selected ? "נבחר" : "בחר"}
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            </AdminCard>

            <AdminCard className="p-6">
              <h2 className="text-lg font-semibold text-[#0F172A] mb-1">כתיבת הודעה</h2>
              <p className="text-sm text-[#64748B] mb-3">תגים דינמיים (לחצו להוספה):</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {BROADCAST_INSERT_TAGS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => insertAtCursor(broadcastRef.current, t.key, broadcastMessage, setBroadcastMessage)}
                    className="rounded-lg border border-[#CCEEF1] bg-[#f5fbfc] px-3 py-1.5 text-xs font-medium text-[#1E6F7C] hover:bg-[#e6f5f7]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <textarea
                ref={broadcastRef}
                dir="rtl"
                className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30"
                placeholder="כתבו כאן את תוכן ההודעה…"
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value)}
              />
            </AdminCard>

            {reviewError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{reviewError}</div>
            )}
            {sendResult && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{sendResult}</div>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
              <button
                type="button"
                disabled={reviewLoading}
                onClick={openReview}
                className="rounded-full bg-[#1E6F7C] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#175a66] disabled:opacity-50"
              >
                {reviewLoading ? "בודקים נמענים…" : "המשך לסקירה לפני שליחה"}
              </button>
            </div>
          </div>

          <AdminCard className="p-6 lg:sticky lg:top-24">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-4 text-center">תצוגה חיה</h2>
            <PhonePreview text={previewSample} />
          </AdminCard>
        </div>
      )}

      {tab === "automations" && localSettings && (
        <div className="space-y-6">
          <AdminCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0F172A]">אישור תור</h2>
                <p className="text-sm text-[#64748B]">נשלח מיד לאחר שמירת תור חדש (כאשר האוטומציה פעילה)</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localSettings.confirmationEnabled}
                onClick={() => updateLocal({ confirmationEnabled: !localSettings.confirmationEnabled })}
                className={`relative h-8 w-14 rounded-full transition-colors ${
                  localSettings.confirmationEnabled ? "bg-[#1E6F7C]" : "bg-[#CBD5E1]"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                    localSettings.confirmationEnabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-[#64748B] mb-2">
              תגים: {"{שם_לקוח}"} {"{שם_העסק}"} {"{תאריך_תור}"} {"{זמן_תור}"} {"{קישור_לתיאום}"}{" "}
              {"{custom_text}"} {"{confirmation_waze_block}"} {"{waze_link}"} — הוויז ממולא מכתובת העסק בהגדרות; בלי כתובת
              התגים הריקים נעלמים.
            </p>
            <textarea
              ref={confirmRef}
              dir="rtl"
              disabled={!localSettings.confirmationEnabled}
              className="w-full min-h-[140px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm disabled:opacity-60"
              value={localSettings.confirmationTemplate}
              onChange={(e) => updateLocal({ confirmationTemplate: e.target.value })}
            />
          </AdminCard>

          <AdminCard className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0F172A]">תזכורת תור</h2>
                <p className="text-sm text-[#64748B]">
                  נשלח לפני התור (ברירת המחדל במערכת: חלון תזכורת יומי ~24 שעות; שדה השעות נשמר להגדרות עתידיות)
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={localSettings.reminderEnabled}
                onClick={() => updateLocal({ reminderEnabled: !localSettings.reminderEnabled })}
                className={`relative h-8 w-14 rounded-full transition-colors ${
                  localSettings.reminderEnabled ? "bg-[#1E6F7C]" : "bg-[#CBD5E1]"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                    localSettings.reminderEnabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-[#0F172A]">שעות לפני התור (שמירה)</label>
              <input
                type="number"
                min={1}
                max={168}
                className="w-24 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm"
                value={localSettings.reminderHoursBefore}
                onChange={(e) => updateLocal({ reminderHoursBefore: Number(e.target.value) || 24 })}
              />
            </div>
            <p className="text-xs text-[#64748B] mb-2">
              חובה לכלול בתבנית: <code className="rounded bg-[#F1F5F9] px-1">{REMINDER_REQUIRED_PLACEHOLDER}</code>
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {REMINDER_INSERT_TAGS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() =>
                    insertAtCursor(reminderRef.current, t.key, localSettings.reminderTemplate, (v) =>
                      updateLocal({ reminderTemplate: v })
                    )
                  }
                  className="rounded-lg border border-[#CCEEF1] bg-[#f5fbfc] px-3 py-1.5 text-xs font-medium text-[#1E6F7C]"
                >
                  {t.label}
                </button>
              ))}
            </div>
            <textarea
              ref={reminderRef}
              dir="rtl"
              disabled={!localSettings.reminderEnabled}
              className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm disabled:opacity-60"
              value={localSettings.reminderTemplate}
              onChange={(e) => updateLocal({ reminderTemplate: e.target.value })}
            />
            {!reminderTemplateHasRequiredTime(localSettings.reminderTemplate) && (
              <p className="mt-2 text-sm text-amber-700">לא ניתן לשמור בלי {REMINDER_REQUIRED_PLACEHOLDER} בתבנית התזכורת</p>
            )}
          </AdminCard>

          {saveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</div>
          )}
          {saveOk && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">ההגדרות נשמרו</div>}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving || !reminderTemplateHasRequiredTime(localSettings.reminderTemplate)}
              onClick={saveAutomations}
              className="rounded-full bg-[#1E6F7C] px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#175a66] disabled:opacity-50"
            >
              {saving ? "שומרים…" : "שמור אוטומציות"}
            </button>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <AdminCard className="max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[#0F172A] mb-2">סקירה לפני שליחה</h3>
            {reviewCount !== null && (
              <p className="text-[#334155] mb-4">
                אתם עומדים לשלוח <strong>{reviewCount}</strong> הודעות WhatsApp.
                {reviewCount > MAX_BROADCAST_RECIPIENTS && (
                  <span className="block mt-2 text-red-700">
                    חריגה מהמגבלה ({MAX_BROADCAST_RECIPIENTS}) — צמצמו מסננים לפני שליחה.
                  </span>
                )}
              </p>
            )}
            {reviewError && <p className="text-sm text-red-700 mb-3">{reviewError}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
                onClick={() => setReviewOpen(false)}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={
                  sendLoading || reviewCount === null || reviewCount === 0 || reviewCount > MAX_BROADCAST_RECIPIENTS
                }
                onClick={confirmSend}
                className="rounded-full bg-[#1E6F7C] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sendLoading ? "שולחים…" : "אשר שליחה"}
              </button>
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  );
}
