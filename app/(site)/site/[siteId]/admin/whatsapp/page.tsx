"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AdminPageHero } from "@/components/admin/AdminPageHero";
import { AdminCard } from "@/components/admin/AdminCard";
import AdminTabs from "@/components/ui/AdminTabs";
import { subscribeClientStatusSettings } from "@/lib/firestoreClientSettings";
import { subscribeWhatsAppSettings } from "@/lib/firestoreWhatsAppSettings";
import { formatIsraelDateTime, formatIsraelTime } from "@/lib/datetime/formatIsraelTime";
import { buildWazeUrlFromAddress } from "@/lib/whatsapp/businessWaze";
import {
  buildClientCancelSystemFallbackText,
  buildClientConfirmSystemFallbackText,
} from "@/lib/whatsapp/inboundReplyFallbackText";
import { renderWhatsAppTemplate, reminderTemplateHasRequiredTime } from "@/lib/whatsapp/templateRender";
import { REMINDER_REQUIRED_PLACEHOLDER } from "@/types/whatsappSettings";
import type { WhatsAppSettingsDoc, WhatsAppTemplateVariables } from "@/types/whatsappSettings";
import { MAX_AUTOMATION_CUSTOM_TEXT_LEN } from "@/types/whatsappSettings";
import type { ManualClientTag } from "@/types/clientStatus";
import { useUnsavedChanges } from "@/components/admin/UnsavedChangesContext";
import {
  MAX_BROADCAST_CUSTOM_TEXT_LEN,
  MAX_BROADCAST_RECIPIENTS,
  type BroadcastAutomatedStatus,
} from "@/lib/whatsapp/broadcastConstants";
import {
  getClientsForBroadcastPicker,
  type ClientBroadcastPickerRow,
} from "@/lib/firestoreClients";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";
import {
  getPublicBookingPageUrlForSiteClient,
  getPublicLandingPageUrlForSiteClient,
} from "@/lib/url";

const TABS = [
  { key: "broadcast" as const, label: "שליחת הודעה קבוצתית" },
  { key: "automations" as const, label: "אוטומציות" },
];

const STATUS_OPTIONS: { value: BroadcastAutomatedStatus; label: string }[] = [
  { value: "new", label: "חדש" },
  { value: "active", label: "פעיל" },
  { value: "sleeping", label: "רדום" },
  { value: "normal", label: "רגיל" },
];

function statusChipClass(status: BroadcastAutomatedStatus, selected: boolean): string {
  const base = "rounded-full border px-4 py-2 text-sm font-medium transition-colors";
  if (!selected) {
    switch (status) {
      case "new":
        return `${base} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`;
      case "active":
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`;
      case "sleeping":
        return `${base} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`;
      case "normal":
      default:
        return `${base} border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200`;
    }
  }
  switch (status) {
    case "new":
      return `${base} border-[#1E6F7C] bg-blue-100 text-blue-800 shadow-sm ring-2 ring-[#1E6F7C]/25`;
    case "active":
      return `${base} border-[#1E6F7C] bg-emerald-100 text-emerald-800 shadow-sm ring-2 ring-[#1E6F7C]/25`;
    case "sleeping":
      return `${base} border-[#1E6F7C] bg-amber-100 text-amber-800 shadow-sm ring-2 ring-[#1E6F7C]/25`;
    case "normal":
    default:
      return `${base} border-[#1E6F7C] bg-slate-200 text-slate-800 shadow-sm ring-2 ring-[#1E6F7C]/25`;
  }
}

function statusBadgeClass(status: BroadcastAutomatedStatus): string {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-medium";
  switch (status) {
    case "new":
      return `${base} bg-blue-100 text-blue-800`;
    case "active":
      return `${base} bg-emerald-100 text-emerald-800`;
    case "sleeping":
      return `${base} bg-amber-100 text-amber-800`;
    case "normal":
    default:
      return `${base} bg-slate-200 text-slate-800`;
  }
}

type ReviewRecipient = {
  e164: string;
  name: string;
  currentStatus?: BroadcastAutomatedStatus;
  manualTagIds: string[];
};

/** תאריך/שעה קבועים לתצוגת אוטומציות (לא משתנים בזמן אמת) */
const AUTOMATION_PREVIEW_DEMO_DATE = new Date("2026-06-15T14:30:00+03:00");

function templateMentionsWaze(template: string): boolean {
  return (
    template.includes("{waze_link}") ||
    template.includes("{קישור_וויז}") ||
    template.includes("{confirmation_waze_block}") ||
    template.includes("{reminder_waze_block}")
  );
}

function WazeMissingHint({ template, hasWazeUrl }: { template: string; hasWazeUrl: boolean }) {
  if (hasWazeUrl || !templateMentionsWaze(template)) return null;
  return (
    <p className="mt-2 max-w-[260px] text-center text-[11px] leading-snug text-[#64748B] lg:text-start" dir="rtl">
      אין כתובת בעסק — קישור הוויז יושמט בהודעה בפועל (כמו בתבנית).
    </p>
  );
}

function AutomationMessageCard({
  title,
  description,
  enabled,
  onToggle,
  previewText,
  wazeHintTemplate,
  hasWazeUrl,
  disabledPreviewNote,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  previewText: string;
  wazeHintTemplate?: string;
  hasWazeUrl?: boolean;
  disabledPreviewNote?: ReactNode;
  children: ReactNode;
}) {
  return (
    <AdminCard className="overflow-hidden p-0">
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 sm:px-6" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">{title}</h2>
            <p className="text-sm text-[#64748B] mt-0.5">{description}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={onToggle}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${enabled ? "bg-[#1E6F7C]" : "bg-[#CBD5E1]"}`}
          >
            <span
              className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                enabled ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
      <div
        className="flex flex-col gap-6 p-4 sm:p-6 lg:flex-row-reverse lg:items-start lg:gap-8"
        dir="ltr"
      >
        <div className="min-w-0 flex-1 space-y-3" dir="rtl">
          {children}
        </div>
        <div className="flex w-full shrink-0 flex-col items-center border-t border-[#E2E8F0] pt-6 lg:w-[min(100%,300px)] lg:border-t-0 lg:border-r lg:pr-8 lg:pt-0">
          <h3 className="text-base font-semibold text-[#0F172A] mb-1 text-center">תצוגה מלאה</h3>
          <p className="text-xs text-[#64748B] text-center mb-4 max-w-[260px]">
            שם לדוגמה; אצל כל נמען יופיעו השם והפרטים האמיתיים.
          </p>
          <PhonePreview text={previewText} compact dimmed={!enabled} />
          {wazeHintTemplate != null && (
            <WazeMissingHint template={wazeHintTemplate} hasWazeUrl={hasWazeUrl ?? false} />
          )}
          {disabledPreviewNote != null ? (
            <div className="mt-2 w-full max-w-[260px] text-center text-[11px] text-[#94A3B8] lg:text-start" dir="rtl">
              {disabledPreviewNote}
            </div>
          ) : null}
        </div>
      </div>
    </AdminCard>
  );
}

function PhonePreview({
  text,
  compact,
  dimmed,
  caption,
}: {
  text: string;
  compact?: boolean;
  dimmed?: boolean;
  /** When set, replaces default “תצוגה לדוגמה” under the phone */
  caption?: string;
}) {
  const preview = text.trim() || "ההודעה תופיע כאן…";
  return (
    <div className={`mx-auto w-full ${compact ? "max-w-[260px]" : "max-w-[280px]"}`}>
      <div
        className={`rounded-[2.25rem] border-[10px] border-[#1e293b] bg-[#1e293b] shadow-[0_24px_48px_-12px_rgba(15,23,42,0.45)] overflow-hidden ${dimmed ? "opacity-[0.72]" : ""}`}
        dir="rtl"
      >
        <div className="flex h-7 items-center justify-center gap-1.5 bg-[#0f172a] pt-1">
          <span className="h-2 w-12 rounded-full bg-[#334155]" />
        </div>
        <div
          className={`bg-[#e5ddd5] ${compact ? "min-h-[200px] px-2.5 py-3" : "min-h-[420px] px-3 py-4"}`}
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.02) 10px, rgba(0,0,0,0.02) 20px)",
          }}
        >
          <div className="flex justify-end">
            <div
              className={`max-w-[92%] rounded-2xl rounded-tr-md px-3.5 py-2.5 leading-relaxed text-[#0f172a] shadow-md ${compact ? "text-[13px]" : "text-sm"}`}
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
      <p className="mt-3 text-center text-xs text-[#64748B]">
        {caption ?? "תצוגה לדוגמה — לא נשלחה הודעה"}
      </p>
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
  const [includeEveryone, setIncludeEveryone] = useState(false);
  const [clientRows, setClientRows] = useState<ClientBroadcastPickerRow[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsLoadError, setClientsLoadError] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const clientSearchWrapRef = useRef<HTMLDivElement>(null);
  /** Free-form segment inside the fixed broadcast template ({custom_text}) */
  const [broadcastCustomText, setBroadcastCustomText] = useState("");
  /** Live preview: real salon name + booking URL from site config */
  const [previewSalonName, setPreviewSalonName] = useState("");
  const [previewTenantSlug, setPreviewTenantSlug] = useState<string | null>(null);
  const [previewBusinessAddress, setPreviewBusinessAddress] = useState("");

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [reviewRecipients, setReviewRecipients] = useState<ReviewRecipient[]>([]);
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
        setPreviewBusinessAddress(cfg?.address?.trim() || "");
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

  const previewLandingUrl = useMemo(
    () => getPublicLandingPageUrlForSiteClient(siteId || "", previewTenantSlug),
    [siteId, previewTenantSlug]
  );

  /** דוגמה לאוטומציות: שם עסק, קישור ווויז מהאתר; שם לקוח ותאריך/שעה קבועים */
  const automationPreviewSamples = useMemo(() => {
    const { dateStr, timeStr } = formatIsraelDateTime(AUTOMATION_PREVIEW_DEMO_DATE);
    const timeOnly = formatIsraelTime(AUTOMATION_PREVIEW_DEMO_DATE);
    const business = previewSalonName.trim() || "שם העסק";
    const wazeUrl = buildWazeUrlFromAddress(previewBusinessAddress);
    const link =
      previewBookingUrl.trim() ||
      (siteId ? getPublicBookingPageUrlForSiteClient(siteId, null) : "");
    const client = "ישראל ישראלי";
    const base: WhatsAppTemplateVariables = {
      שם_לקוח: client,
      client_name: client,
      שם_העסק: business,
      business_name: business,
      תאריך_תור: dateStr,
      date: dateStr,
      זמן_תור: timeStr,
      time: timeOnly,
      קישור_לתיאום: link,
      link,
      waze_link: wazeUrl,
    };
    return { dateStr, timeStr, timeOnly, business, wazeUrl, link, client, base };
  }, [previewSalonName, previewBookingUrl, previewBusinessAddress, siteId]);

  const confirmationAutomationPreview = useMemo(() => {
    if (!localSettings) return "";
    return renderWhatsAppTemplate(localSettings.confirmationTemplate, {
      ...automationPreviewSamples.base,
      custom_text: (localSettings.confirmationCustomText ?? "").trim(),
    });
  }, [localSettings, automationPreviewSamples]);

  const reminderAutomationPreview = useMemo(() => {
    if (!localSettings) return "";
    return renderWhatsAppTemplate(localSettings.reminderTemplate, {
      ...automationPreviewSamples.base,
      custom_text: (localSettings.reminderCustomText ?? "").trim(),
      waze_link: "",
    });
  }, [localSettings, automationPreviewSamples]);

  const clientConfirmAutomationPreview = useMemo(() => {
    if (!localSettings) return "";
    const { business, timeOnly, wazeUrl, base } = automationPreviewSamples;
    if (!localSettings.clientConfirmReplyEnabled) {
      return buildClientConfirmSystemFallbackText({
        time: timeOnly,
        businessName: business,
        wazeUrl,
      });
    }
    const t = localSettings.clientConfirmReplyTemplate.trim();
    if (!t) {
      return buildClientConfirmSystemFallbackText({ time: timeOnly, businessName: business, wazeUrl });
    }
    return renderWhatsAppTemplate(t, {
      ...base,
      custom_text: (localSettings.clientConfirmReplyCustomText ?? "").trim(),
    });
  }, [localSettings, automationPreviewSamples]);

  const clientCancelAutomationPreview = useMemo(() => {
    if (!localSettings) return "";
    const { business, base } = automationPreviewSamples;
    if (!localSettings.clientCancelReplyEnabled) {
      return buildClientCancelSystemFallbackText(business);
    }
    const t = localSettings.clientCancelReplyTemplate.trim();
    if (!t) {
      return buildClientCancelSystemFallbackText(business);
    }
    return renderWhatsAppTemplate(t, {
      ...base,
      custom_text: (localSettings.clientCancelReplyCustomText ?? "").trim(),
    });
  }, [localSettings, automationPreviewSamples]);

  const broadcastPreviewText = useMemo(() => {
    if (!localSettings) return "";
    return renderWhatsAppTemplate(localSettings.broadcastTemplate, {
      שם_לקוח: "ישראל ישראלי",
      שם_העסק: previewSalonName || "שם העסק",
      קישור_לתיאום: previewLandingUrl,
      client_name: "ישראל ישראלי",
      business_name: previewSalonName || "שם העסק",
      link: previewLandingUrl,
      custom_text: broadcastCustomText.trim() || "הטקסט שלכם יופיע כאן…",
    });
  }, [localSettings, previewSalonName, previewLandingUrl, broadcastCustomText]);

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

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (clientSearchWrapRef.current?.contains(target)) return;
      setClientSearchOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const everyoneCount = clientRows.length;
  const statusLabelByValue = useMemo(
    () => new Map<BroadcastAutomatedStatus, string>(STATUS_OPTIONS.map((s) => [s.value, s.label])),
    []
  );
  const manualTagLabelById = useMemo(
    () => new Map<string, string>(manualTags.map((t) => [t.id, t.label])),
    [manualTags]
  );
  const statusCounts = useMemo(() => {
    const counts: Record<BroadcastAutomatedStatus, number> = {
      new: 0,
      active: 0,
      normal: 0,
      sleeping: 0,
    };
    clientRows.forEach((row) => {
      if (!row.currentStatus) return;
      if (row.currentStatus in counts) counts[row.currentStatus as BroadcastAutomatedStatus] += 1;
    });
    return counts;
  }, [clientRows]);
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of clientRows) {
      for (const tagId of row.manualTagIds ?? []) {
        m.set(tagId, (m.get(tagId) ?? 0) + 1);
      }
    }
    return m;
  }, [clientRows]);
  const isRowMatchedByGroupFilters = useCallback(
    (row: ClientBroadcastPickerRow) => {
      if (includeEveryone) return true;
      const statusMatch =
        selectedStatuses.length > 0 &&
        !!row.currentStatus &&
        selectedStatuses.includes(row.currentStatus as BroadcastAutomatedStatus);
      const tags = row.manualTagIds ?? [];
      const tagMatch = selectedTagIds.length > 0 && selectedTagIds.some((id) => tags.includes(id));
      if (statusMatch && tagMatch) return true;
      if (statusMatch && selectedTagIds.length === 0) return true;
      if (tagMatch && selectedStatuses.length === 0) return true;
      return false;
    },
    [includeEveryone, selectedStatuses, selectedTagIds]
  );
  const isRowSelected = useCallback(
    (row: ClientBroadcastPickerRow) => selectedClientIds.includes(row.id) || isRowMatchedByGroupFilters(row),
    [selectedClientIds, isRowMatchedByGroupFilters]
  );

  const currentlySelectedHint = useMemo(() => {
    if (includeEveryone) return everyoneCount;
    const selectedById = new Set(selectedClientIds);
    for (const row of clientRows) {
      if (isRowMatchedByGroupFilters(row)) selectedById.add(row.id);
    }
    return selectedById.size;
  }, [includeEveryone, everyoneCount, selectedClientIds, clientRows, isRowMatchedByGroupFilters]);

  const filtersValid =
    includeEveryone || selectedStatuses.length > 0 || selectedTagIds.length > 0 || selectedClientIds.length > 0;

  const getToken = useCallback(async () => {
    if (!firebaseUser) throw new Error("לא מחוברים");
    return firebaseUser.getIdToken();
  }, [firebaseUser]);

  const [usageSnapshot, setUsageSnapshot] = useState<{
    totalUsed: number;
    whatsappUsageLimit: number;
    whatsappUtilitySent: number;
    whatsappServiceSent: number;
  } | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  const loadUsage = useCallback(async () => {
    if (!siteId || !firebaseUser) return;
    setUsageLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/sites/${encodeURIComponent(siteId)}/whatsapp/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        totalUsed?: number;
        whatsappUsageLimit?: number;
        whatsappUtilitySent?: number;
        whatsappServiceSent?: number;
      };
      if (data.ok && typeof data.totalUsed === "number" && typeof data.whatsappUsageLimit === "number") {
        setUsageSnapshot({
          totalUsed: data.totalUsed,
          whatsappUsageLimit: data.whatsappUsageLimit,
          whatsappUtilitySent: typeof data.whatsappUtilitySent === "number" ? data.whatsappUtilitySent : 0,
          whatsappServiceSent: typeof data.whatsappServiceSent === "number" ? data.whatsappServiceSent : 0,
        });
      }
    } catch {
      // ignore
    } finally {
      setUsageLoading(false);
    }
  }, [siteId, firebaseUser]);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  const usageAtLimit = useMemo(
    () =>
      usageSnapshot != null &&
      usageSnapshot.whatsappUsageLimit > 0 &&
      usageSnapshot.totalUsed >= usageSnapshot.whatsappUsageLimit,
    [usageSnapshot]
  );

  const usageWarn80 = useMemo(
    () =>
      usageSnapshot != null &&
      usageSnapshot.whatsappUsageLimit > 0 &&
      !usageAtLimit &&
      usageSnapshot.totalUsed / usageSnapshot.whatsappUsageLimit >= 0.8,
    [usageSnapshot, usageAtLimit]
  );

  const usagePercent = useMemo(() => {
    if (!usageSnapshot || usageSnapshot.whatsappUsageLimit <= 0) return 0;
    return Math.min(100, (usageSnapshot.totalUsed / usageSnapshot.whatsappUsageLimit) * 100);
  }, [usageSnapshot]);

  const openReview = async () => {
    setReviewError(null);
    setSendResult(null);
    setReviewRecipients([]);
    if (!filtersValid) {
      setReviewError("בחרו לפחות אחד: כולם, סטטוס אוטומטי, תג ידני, או לקוחות ספציפיים מהרשימה.");
      return;
    }
    if (!broadcastCustomText.trim()) {
      setReviewError("כתבו את תוכן ההודעה (החלק שמופיע אחרי שם העסק, לפני הקישור).");
      return;
    }
    if (broadcastCustomText.trim().length > MAX_BROADCAST_CUSTOM_TEXT_LEN) {
      setReviewError(`הטקסט המותאם ארוך מדי (עד ${MAX_BROADCAST_CUSTOM_TEXT_LEN} תווים).`);
      return;
    }
    if (usageAtLimit) {
      setReviewError("הגעתם למכסת הודעות החודשית. שדרגו את החבילה או נסו שוב בחודש הבא.");
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
          includeEveryone,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        count?: unknown;
        error?: string;
        recipients?: Array<{
          e164?: unknown;
          name?: unknown;
          currentStatus?: unknown;
          manualTagIds?: unknown;
        }>;
      };
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setReviewCount(typeof data.count === "number" ? data.count : 0);
      const recipients = Array.isArray(data.recipients)
        ? data.recipients
            .map((r) => ({
              e164: typeof r.e164 === "string" ? r.e164 : "",
              name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : "לקוח",
              currentStatus:
                typeof r.currentStatus === "string" &&
                ["new", "active", "sleeping", "normal"].includes(r.currentStatus)
                  ? (r.currentStatus as BroadcastAutomatedStatus)
                  : undefined,
              manualTagIds: Array.isArray(r.manualTagIds)
                ? r.manualTagIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
                : [],
            }))
            .filter((r) => r.e164)
        : [];
      setReviewRecipients(recipients);
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
          includeEveryone,
          message: broadcastCustomText.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "שגיאת שליחה");
      setSendResult(`נשלחו ${data.sent} הודעות${data.failed ? `, ${data.failed} נכשלו` : ""}.`);
      setReviewOpen(false);
      setReviewRecipients([]);
      await loadUsage();
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
    if (localSettings.clientConfirmReplyEnabled && !localSettings.clientConfirmReplyTemplate.trim()) {
      setSaveError("כשהתשובה לאחר אישור פעילה — יש למלא תבנית טקסט");
      return;
    }
    if (localSettings.clientCancelReplyEnabled && !localSettings.clientCancelReplyTemplate.trim()) {
      setSaveError("כשהתשובה לאחר ביטול פעילה — יש למלא תבנית טקסט");
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

  /** Stable wrapper so we don’t re-register unsaved on every Firestore-driven localSettings change */
  const saveAutomationsRef = useRef(saveAutomations);
  saveAutomationsRef.current = saveAutomations;

  useEffect(() => {
    if (!unsavedCtx) return;
    unsavedCtx.setUnsaved(autoDirty, () => {
      const run = saveAutomationsRef.current;
      return run();
    });
    return () => {
      unsavedCtx.setUnsaved(false, () => {});
    };
  }, [unsavedCtx, autoDirty]);

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
        subtitle="שליחת הודעות ישירות ללקוחות — עדכונים, מבצעים, תזכורות ואוטומציות מהמערכת"
        pills={["Premium", "WhatsApp"]}
        glass
      >
        <div className="mt-4 flex items-center gap-2 text-sm text-[#64748B]">
          <MessageSquare className="w-4 h-4 text-[#1E6F7C]" aria-hidden />
          <span>ההודעות יוצאות כשיחות WhatsApp ללקוחות שבחרתם</span>
        </div>
      </AdminPageHero>

      <AdminTabs tabs={TABS} activeKey={tab} onChange={setTab} />

      <AdminCard className="p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">שימוש ב־WhatsApp החודש</h2>
            <p className="mt-1 text-sm text-[#64748B]">
              נספרות כל ההודעות היוצאות מול המכסה החודשית. יוזמה — תזכורות ושליחה יזומה; שירות — תשובות לאחר פנייה
              מהלקוח.
            </p>
          </div>
          {usageAtLimit && (
            <Link
              href="/pricing"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#1E6F7C] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#175a66]"
            >
              שדרוג חבילה
            </Link>
          )}
        </div>
        {usageLoading ? (
          <p className="mt-4 text-sm text-[#64748B]">טוען נתוני שימוש…</p>
        ) : usageSnapshot ? (
          <>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-2xl font-bold tabular-nums text-[#0F172A]">
                {usageSnapshot.totalUsed} / {usageSnapshot.whatsappUsageLimit}
              </span>
              <span className="text-sm text-[#64748B]">הודעות החודש</span>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
              <div
                className={`h-full rounded-full transition-all ${
                  usageAtLimit ? "bg-red-500" : usageWarn80 ? "bg-amber-400" : "bg-[#1E6F7C]"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-[#64748B]">
              יוזמה: {usageSnapshot.whatsappUtilitySent} · שירות: {usageSnapshot.whatsappServiceSent}
            </p>
            {usageWarn80 && !usageAtLimit && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                השתמשתם ביותר מ־80% מהמכסה החודשית. שקלו לשדרג לפני שתיעצרו שליחות אוטומטיות.
              </div>
            )}
            {usageAtLimit && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                הגעתם למכסה החודשית — שליחה קבוצתית ואוטומציות מבוססות WhatsApp לא יישלחו עד לאיפוס החודשי או לשדרוג.
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-[#64748B]">לא ניתן לטעון את נתוני השימוש כרגע.</p>
        )}
      </AdminCard>

      {tab === "broadcast" && localSettings && (
        <div className="space-y-6">
          {/* Message first, preview beside; then recipients below */}
          <AdminCard className="overflow-hidden p-0">
            <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 sm:px-6" dir="rtl">
              <h2 className="text-lg font-semibold text-[#0F172A]">תוכן ההודעה</h2>
              <p className="text-sm text-[#64748B] mt-0.5">
                כתבו מה רוצים להגיד — מבצע, שעות חדשות, אירוע, או כל עדכון. לידכם תצוגה מלאה כפי שהלקוח יראה ב-WhatsApp.
              </p>
            </div>
            <div
              className="flex flex-col gap-6 p-4 sm:p-6 lg:flex-row-reverse lg:items-start lg:gap-8"
              dir="ltr"
            >
              <div className="min-w-0 flex-1 space-y-3" dir="rtl">
                <p className="text-sm text-[#64748B] leading-relaxed">
                  כאן שולחים הודעה אחת לכל מי שבחרתם ב-WhatsApp — עדכונים, מבצעים, דברים חשובים שהלקוחות צריכים לדעת, או כל מה שמתאים
                  לעסק. המערכת מוסיפה פנייה אישית, שם העסק וקישור לדף שלכם, כדי שההודעה תיראה מסודרת.
                </p>
                <label htmlFor="broadcast-custom-text" className="text-sm font-medium text-[#0F172A] block">
                  נוסח ההודעה
                </label>
                <textarea
                  id="broadcast-custom-text"
                  dir="rtl"
                  className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30"
                  placeholder="למשל: מבצע השבוע, עדכון על שעות פתיחה, הזמנה לאירוע…"
                  value={broadcastCustomText}
                  maxLength={MAX_BROADCAST_CUSTOM_TEXT_LEN}
                  onChange={(e) => setBroadcastCustomText(e.target.value)}
                />
                <p className="text-xs text-[#64748B]">
                  {broadcastCustomText.length}/{MAX_BROADCAST_CUSTOM_TEXT_LEN} תווים
                </p>
              </div>
              <div className="flex w-full shrink-0 flex-col items-center border-t border-[#E2E8F0] pt-6 lg:w-[min(100%,300px)] lg:border-t-0 lg:border-r lg:pr-8 lg:pt-0">
                <h3 className="text-base font-semibold text-[#0F172A] mb-1 text-center">תצוגה מלאה</h3>
                <p className="text-xs text-[#64748B] text-center mb-4 max-w-[260px]">
                  שם לדוגמה; אצל כל נמען יופיע השם והקישור לאתר.
                </p>
                <PhonePreview text={broadcastPreviewText} />
              </div>
            </div>
          </AdminCard>

          <AdminCard className="p-6">
            <h2 className="text-lg font-semibold text-[#0F172A] mb-1">למי לשלוח את ההודעה?</h2>
            <p className="text-sm text-[#64748B] mb-4">
              בחרו למי לשלוח: כל הלקוחות, לפי סוג סטטוס אוטומטי, לפי תג, או לקוחות ספציפיים מהרשימה. אפשר לשלב — למשל סטטוס ותג
              יחד כדי לדייק את הקהל.
            </p>
            <div className="mb-4">
              <span className="rounded-full bg-[#EFF6FF] px-3 py-2 text-xs font-medium text-[#1E3A8A]">
                נבחרו כרגע: {currentlySelectedHint}
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-[#0F172A] mb-2">סטטוס אוטומטי</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        setIncludeEveryone(false);
                        toggleStatus(o.value);
                      }}
                      className={statusChipClass(o.value, selectedStatuses.includes(o.value))}
                    >
                      {o.label} ({statusCounts[o.value] ?? 0})
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setIncludeEveryone((prev) => {
                        const next = !prev;
                        if (next) {
                          // "Everyone" is exclusive: clear all other filters.
                          setSelectedStatuses([]);
                          setSelectedTagIds([]);
                          setSelectedClientIds([]);
                        }
                        return next;
                      });
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      includeEveryone
                        ? "border border-[#1E6F7C] bg-[#0B5E6A] text-white shadow-sm ring-2 ring-[#1E6F7C]/25"
                        : "border border-transparent bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                    }`}
                  >
                    כולם ({everyoneCount})
                  </button>
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
                        onClick={() => {
                          setIncludeEveryone(false);
                          toggleTag(t.id);
                        }}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                          selectedTagIds.includes(t.id)
                            ? "border border-[#1E6F7C] bg-[#0d9488] text-white shadow-sm ring-2 ring-[#1E6F7C]/25"
                            : "border border-transparent bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0]"
                        }`}
                      >
                        {t.label} ({tagCounts.get(t.id) ?? 0})
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div ref={clientSearchWrapRef}>
                <p className="text-sm font-medium text-[#0F172A] mb-2">לקוחות לפי שם (יחידים)</p>
                <p className="text-xs text-[#64748B] mb-2">
                  חיפוש לפי שם או מספר טלפון. לחיצה על שורה מוסיפה או מסירה מהשליחה.
                  {selectedClientIds.length > 0 && (
                    <span className="font-medium text-[#1E6F7C]">
                      {" "}
                      נבחרו ידנית {selectedClientIds.length} לקוחות
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
                  onFocus={() => setClientSearchOpen(true)}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {clientsLoadError && <p className="text-sm text-red-600 mb-2">{clientsLoadError}</p>}
                {!clientSearchOpen ? (
                  <p className="text-xs text-[#94A3B8]">הרשימה תופיע אחרי לחיצה על שדה החיפוש.</p>
                ) : clientsLoading ? (
                  <p className="text-sm text-[#64748B] py-4 text-center">טוען לקוחות…</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] divide-y divide-[#E2E8F0]">
                    {filteredClientRows.length === 0 ? (
                      <p className="p-4 text-sm text-[#94A3B8] text-center">לא נמצאו לקוחות</p>
                    ) : (
                      filteredClientRows.map((row) => {
                        const selected = isRowSelected(row);
                        const statusLabel = row.currentStatus ? statusLabelByValue.get(row.currentStatus as BroadcastAutomatedStatus) : null;
                        return (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => {
                              setIncludeEveryone(false);
                              toggleClientRow(row.id);
                            }}
                            className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm transition-colors ${
                              selected
                                ? "bg-[#cceef1]/80 text-[#0F172A]"
                                : "bg-white hover:bg-[#F1F5F9] text-[#334155]"
                            }`}
                          >
                            <span className="min-w-0 flex-1 text-right">
                              <span className="block truncate font-medium">{row.name}</span>
                              <span className="mt-1 flex flex-wrap gap-1.5">
                                {statusLabel && (
                                  <span className={statusBadgeClass(row.currentStatus as BroadcastAutomatedStatus)}>
                                    סטטוס: {statusLabel}
                                  </span>
                                )}
                                {(row.manualTagIds ?? []).map((tagId) => (
                                  <span
                                    key={`${row.id}-${tagId}`}
                                    className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#334155]"
                                  >
                                    תג: {manualTagLabelById.get(tagId) ?? tagId}
                                  </span>
                                ))}
                              </span>
                            </span>
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

          {reviewError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{reviewError}</div>
          )}
          {sendResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{sendResult}</div>
          )}

          <div className="flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              disabled={reviewLoading || usageLoading || usageAtLimit}
              onClick={openReview}
              className="rounded-full bg-[#1E6F7C] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#175a66] disabled:opacity-50"
            >
              {reviewLoading ? "בודקים נמענים…" : "המשך לסקירה לפני שליחה"}
            </button>
          </div>
        </div>
      )}

      {tab === "automations" && localSettings && (
        <div className="space-y-6">
          {usageAtLimit && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" dir="rtl">
              הגעתם למכסת WhatsApp החודשית — תזכורות ואוטומציות מהמערכת לא יישלחו עד איפוס החודשי או שדרוג.{" "}
              <Link href="/pricing" className="font-semibold text-[#1E6F7C] underline">
                שדרוג חבילה
              </Link>
            </div>
          )}
          <div
            className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-sm text-[#64748B]"
            dir="rtl"
          >
            <strong className="text-[#334155]">איך זה עובד:</strong> כתבו רק את החלק שאתם רוצים להוסיף — בתצוגת הטלפון
            תראו את כל ההודעה כמו שהלקוח יקבל (שם לדוגמה, תאריך ושעה לדוגמה, קישורים). קישור וויז מופיע רק בתשובה
            לאחר אישור הלקוח.
          </div>

          <div
            className="rounded-xl border border-[#E2E8F0] bg-white px-4 py-4 text-sm text-[#334155]"
            dir="rtl"
          >
            <p className="mb-3 font-medium text-[#0F172A]">אישור תור לאחר הזמנה באתר</p>
            <div className="flex flex-col gap-3">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="postBookingConfirmationMode"
                  className="mt-1"
                  checked={localSettings.postBookingConfirmationMode === "auto"}
                  onChange={() => updateLocal({ postBookingConfirmationMode: "auto" })}
                />
                <span>
                  <span className="font-medium">שליחה מיידית</span>
                  <span className="block text-[#64748B]">
                    הודעת וואטסאפ נשלחת אוטומטית מיד לאחר שמירת התור (התנהגות קודמת).
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="postBookingConfirmationMode"
                  className="mt-1"
                  checked={localSettings.postBookingConfirmationMode === "whatsapp_opt_in"}
                  onChange={() => updateLocal({ postBookingConfirmationMode: "whatsapp_opt_in" })}
                />
                <span>
                  <span className="font-medium">לפי לחיצת הלקוח (מומלץ לחיסכון בעלות)</span>
                  <span className="block text-[#64748B]">
                    לא נשלחת הודעה אוטומטית. בדף ההצלחה מופיע כפתור לוואטסאפ עם טקסט מוכן; כשהלקוח שולח — הבוט
                    משיב באותה תבנית אישור (שיחה שירותית).
                  </span>
                </span>
              </label>
            </div>
          </div>

          <AutomationMessageCard
            title="אישור תור"
            description="נשלח מיד לאחר שמירת תור חדש (כאשר האוטומציה פעילה)"
            enabled={localSettings.confirmationEnabled}
            onToggle={() => updateLocal({ confirmationEnabled: !localSettings.confirmationEnabled })}
            previewText={confirmationAutomationPreview}
            disabledPreviewNote={
              !localSettings.confirmationEnabled ? (
                <span className="text-amber-800">האוטומציה כבויה — לא תישלח הודעה אוטומטית.</span>
              ) : undefined
            }
          >
            <p className="text-sm text-[#64748B] leading-relaxed">
              המערכת בונה את פתיחת ההודעה והנתונים על התור; כאן תוסיפו משפט משלכם (או השאירו ריק).
            </p>
            <label htmlFor="confirmation-custom-text" className="text-sm font-medium text-[#0F172A] block">
              נוסח ההודעה
            </label>
            <textarea
              id="confirmation-custom-text"
              dir="rtl"
              disabled={!localSettings.confirmationEnabled}
              maxLength={MAX_AUTOMATION_CUSTOM_TEXT_LEN}
              placeholder="למשל: שימו לב לאופן החניה, או שמחנו לקבוע אתכם…"
              className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30 disabled:opacity-60"
              value={localSettings.confirmationCustomText}
              onChange={(e) =>
                updateLocal({
                  confirmationCustomText: e.target.value.slice(0, MAX_AUTOMATION_CUSTOM_TEXT_LEN),
                })
              }
            />
            <p className="text-xs text-[#94A3B8]">
              {(localSettings.confirmationCustomText ?? "").length}/{MAX_AUTOMATION_CUSTOM_TEXT_LEN} תווים
            </p>
          </AutomationMessageCard>

          <AutomationMessageCard
            title="תזכורת תור"
            description="נשלח לפני התור לפי לוח התזכורות היומי במערכת (~24 שעות מראש)"
            enabled={localSettings.reminderEnabled}
            onToggle={() => updateLocal({ reminderEnabled: !localSettings.reminderEnabled })}
            previewText={reminderAutomationPreview}
            disabledPreviewNote={
              !localSettings.reminderEnabled ? (
                <span className="text-amber-800">האוטומציה כבויה — לא תישלח תזכורת אוטומטית.</span>
              ) : undefined
            }
          >
            <p className="text-sm text-[#64748B] leading-relaxed">
              כאן אפשר להוסיף משפט בין פרטי התזכורת לבין שאלת ההגעה (&quot;מגיעים?&quot;) — או להשאיר ריק.
            </p>
            <label htmlFor="reminder-custom-text" className="text-sm font-medium text-[#0F172A] block">
              נוסח ההודעה
            </label>
            <textarea
              id="reminder-custom-text"
              dir="rtl"
              disabled={!localSettings.reminderEnabled}
              maxLength={MAX_AUTOMATION_CUSTOM_TEXT_LEN}
              placeholder="למשל: נשמח לאשר שהגעה מראש, או הנחיות ליום התור…"
              className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30 disabled:opacity-60"
              value={localSettings.reminderCustomText}
              onChange={(e) =>
                updateLocal({
                  reminderCustomText: e.target.value.slice(0, MAX_AUTOMATION_CUSTOM_TEXT_LEN),
                })
              }
            />
            <p className="text-xs text-[#94A3B8]">
              {(localSettings.reminderCustomText ?? "").length}/{MAX_AUTOMATION_CUSTOM_TEXT_LEN} תווים
            </p>
            {!reminderTemplateHasRequiredTime(localSettings.reminderTemplate) && (
              <p className="text-sm text-amber-700">
                תבנית התזכורת אצלך לא תקינה — שמרו שוב או פנו לתמיכה (חסר מיקום שעה בתבנית).
              </p>
            )}
          </AutomationMessageCard>

          <AutomationMessageCard
            title="תשובה לאחר אישור הלקוח"
            description='נשלח אוטומטית כשהלקוח מאשר תור בוואטסאפ ("כן" או בחירה מתפריט)'
            enabled={localSettings.clientConfirmReplyEnabled}
            onToggle={() => updateLocal({ clientConfirmReplyEnabled: !localSettings.clientConfirmReplyEnabled })}
            previewText={clientConfirmAutomationPreview}
            wazeHintTemplate={localSettings.clientConfirmReplyTemplate}
            hasWazeUrl={!!automationPreviewSamples.wazeUrl}
            disabledPreviewNote={
              !localSettings.clientConfirmReplyEnabled ? (
                <span className="text-amber-800">תבנית מותאמת כבויה — נשלחת הודעת מערכת קצרה (כמו בתצוגה).</span>
              ) : undefined
            }
          >
            <p className="text-sm text-[#64748B] leading-relaxed">
              לאחר שאישרו את התור, המערכת שולחת אישור עם שעה ושם העסק. הוסיפו כאן משפט משלכם לפני קישור הוויז בשורה
              נפרדת, או השאירו ריק.
            </p>
            <label htmlFor="client-confirm-custom-text" className="text-sm font-medium text-[#0F172A] block">
              נוסח ההודעה
            </label>
            <textarea
              id="client-confirm-custom-text"
              dir="rtl"
              disabled={!localSettings.clientConfirmReplyEnabled}
              maxLength={MAX_AUTOMATION_CUSTOM_TEXT_LEN}
              placeholder="למשל: מחכים לכם בשמחה…"
              className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30 disabled:opacity-60"
              value={localSettings.clientConfirmReplyCustomText}
              onChange={(e) =>
                updateLocal({
                  clientConfirmReplyCustomText: e.target.value.slice(0, MAX_AUTOMATION_CUSTOM_TEXT_LEN),
                })
              }
            />
            <p className="text-xs text-[#94A3B8]">
              {(localSettings.clientConfirmReplyCustomText ?? "").length}/{MAX_AUTOMATION_CUSTOM_TEXT_LEN} תווים
            </p>
          </AutomationMessageCard>

          <AutomationMessageCard
            title="תשובה לאחר ביטול הלקוח"
            description='נשלח אוטומטית כשהלקוח מבטל תור בוואטסאפ ("לא" או בחירה מתפריט)'
            enabled={localSettings.clientCancelReplyEnabled}
            onToggle={() => updateLocal({ clientCancelReplyEnabled: !localSettings.clientCancelReplyEnabled })}
            previewText={clientCancelAutomationPreview}
            disabledPreviewNote={
              !localSettings.clientCancelReplyEnabled ? (
                <span className="text-amber-800">תבנית מותאמת כבויה — נשלחת הודעת מערכת (כמו בתצוגה).</span>
              ) : undefined
            }
          >
            <p className="text-sm text-[#64748B] leading-relaxed">
              לאחר ביטול, נשלחת הודעת המערכת. אפשר להוסיף כאן משפט נעים או הזמנה לחזור — בתחתית ההודעה.
            </p>
            <label htmlFor="client-cancel-custom-text" className="text-sm font-medium text-[#0F172A] block">
              נוסח ההודעה
            </label>
            <textarea
              id="client-cancel-custom-text"
              dir="rtl"
              disabled={!localSettings.clientCancelReplyEnabled}
              maxLength={MAX_AUTOMATION_CUSTOM_TEXT_LEN}
              placeholder="למשל: נשמח לראותכם שוב בקרוב…"
              className="w-full min-h-[160px] rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#1E6F7C]/30 disabled:opacity-60"
              value={localSettings.clientCancelReplyCustomText}
              onChange={(e) =>
                updateLocal({
                  clientCancelReplyCustomText: e.target.value.slice(0, MAX_AUTOMATION_CUSTOM_TEXT_LEN),
                })
              }
            />
            <p className="text-xs text-[#94A3B8]">
              {(localSettings.clientCancelReplyCustomText ?? "").length}/{MAX_AUTOMATION_CUSTOM_TEXT_LEN} תווים
            </p>
          </AutomationMessageCard>

          {saveError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{saveError}</div>
          )}
          {saveOk && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">ההגדרות נשמרו</div>}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={
                saving ||
                !reminderTemplateHasRequiredTime(localSettings.reminderTemplate) ||
                (localSettings.clientConfirmReplyEnabled && !localSettings.clientConfirmReplyTemplate.trim()) ||
                (localSettings.clientCancelReplyEnabled && !localSettings.clientCancelReplyTemplate.trim())
              }
              onClick={saveAutomations}
              className="rounded-full bg-[#1E6F7C] px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#175a66] disabled:opacity-50"
            >
              {saving ? "שומרים…" : "שמור אוטומציות"}
            </button>
          </div>
        </div>
      )}

      {reviewOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          data-admin-modal-overlay=""
          dir="rtl"
        >
          <AdminCard className="max-w-xl w-full p-6 shadow-xl">
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
            {reviewRecipients.length > 0 && (
              <div className="mb-4 max-h-56 overflow-y-auto rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]">
                <div className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-white/95 px-3 py-2 text-xs font-semibold text-[#334155]">
                  רשימת נמענים שנבחרו ({reviewRecipients.length})
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {reviewRecipients.map((r) => (
                    <div key={`${r.e164}-${r.name}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[#0F172A]">{r.name}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {r.currentStatus && (
                            <span className={statusBadgeClass(r.currentStatus)}>
                              סטטוס: {statusLabelByValue.get(r.currentStatus) ?? r.currentStatus}
                            </span>
                          )}
                          {r.manualTagIds.map((tagId) => (
                            <span
                              key={`${r.e164}-${tagId}`}
                              className="rounded-full bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-medium text-[#334155]"
                            >
                              תג: {manualTagLabelById.get(tagId) ?? tagId}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs text-[#64748B]" dir="ltr">
                        {r.e164}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {reviewError && <p className="text-sm text-red-700 mb-3">{reviewError}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm font-medium text-[#64748B] hover:bg-[#F1F5F9]"
                onClick={() => {
                  setReviewOpen(false);
                  setReviewRecipients([]);
                }}
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={
                  sendLoading ||
                  reviewCount === null ||
                  reviewCount === 0 ||
                  reviewCount > MAX_BROADCAST_RECIPIENTS ||
                  usageAtLimit
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
