"use client";

/**
 * Dev-only demo: note indicator at 15/30/45/60 min slot heights.
 * Open /site/[siteId]/admin/bookings/note-indicator-demo to verify
 * the red dot scales consistently and doesn’t overlap text.
 */
import Link from "next/link";
import { useParams } from "next/navigation";
import { getAdminBasePathFromSiteId } from "@/lib/url";

const SLOT_HEIGHT_PX = 20; // 15 min per row (matches DayGrid)

const NOTE_INDICATOR_STYLE = {
  top: "clamp(2px, 10%, 6px)",
  left: "clamp(2px, 10%, 6px)",
  width: "clamp(8px, 18%, 12px)",
  height: "clamp(8px, 18%, 12px)",
  border: "2px solid #fff",
  boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
  zIndex: 11,
} as const;

function MockSlot({
  heightPx,
  label,
  hasNote,
  color = "#3B82F6",
}: {
  heightPx: number;
  label: string;
  hasNote: boolean;
  color?: string;
}) {
  return (
    <div
      className="relative rounded-lg overflow-hidden flex items-center justify-end px-2 min-h-0 w-full max-w-[280px]"
      style={{
        height: heightPx,
        backgroundColor: color,
        color: "#fff",
        fontSize: "11px",
      }}
    >
      {hasNote && (
        <span
          className="absolute rounded-full bg-red-500 pointer-events-none"
          style={NOTE_INDICATOR_STYLE}
          aria-label="Has note"
          title="יש הערה"
        />
      )}
      <div
        dir="rtl"
        className="min-w-0 w-full text-right overflow-hidden flex flex-col gap-0.5 py-0.5"
        style={hasNote ? { paddingLeft: "clamp(14px, 24%, 18px)" } : undefined}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-semibold truncate">לקוח לדוגמה</span>
          <span className="truncate"> — שירות / סוג</span>
        </div>
      </div>
    </div>
  );
}

export default function NoteIndicatorDemoPage() {
  const params = useParams();
  const siteId = typeof params?.siteId === "string" ? params.siteId : "";
  const adminBasePath = getAdminBasePathFromSiteId(siteId);

  return (
    <div className="min-h-screen p-6" dir="rtl">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">דמו: אינדיקטור הערות</h1>
          <Link
            href={`${adminBasePath}/bookings`}
            className="text-sm text-caleno-600 hover:underline"
          >
            ← חזרה ליומן
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          גובה כל תור: 15 / 30 / 45 / 60 דקות. הנקודה האדומה אמורה להיראות באותו פרופורציה.
        </p>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500 mb-1">15 דקות (עם הערה)</p>
            <MockSlot
              heightPx={1 * SLOT_HEIGHT_PX}
              label="15min"
              hasNote
            />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">30 דקות (ללא הערה)</p>
            <MockSlot
              heightPx={2 * SLOT_HEIGHT_PX}
              label="30min"
              hasNote={false}
            />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">45 דקות (עם הערה)</p>
            <MockSlot
              heightPx={3 * SLOT_HEIGHT_PX}
              label="45min"
              hasNote
            />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">60 דקות (ללא הערה)</p>
            <MockSlot
              heightPx={4 * SLOT_HEIGHT_PX}
              label="60min"
              hasNote={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
