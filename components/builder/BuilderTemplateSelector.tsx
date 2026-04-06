"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Check, X } from "lucide-react";
import type { PublicSiteTemplateId } from "@/types/siteConfig";
import { BUILDER_PUBLIC_TEMPLATES } from "@/components/templates/builderPublicTemplates";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const HairLuxuryBuilderPreview = dynamic(
  () => import("@/components/templates/previews/HairLuxuryBuilderPreview"),
  { ssr: false, loading: () => <PreviewLoading /> }
);
const GentlemansBarberBuilderPreview = dynamic(
  () => import("@/components/templates/previews/GentlemansBarberBuilderPreview"),
  { ssr: false, loading: () => <PreviewLoading /> }
);
const VogueNailsBuilderPreview = dynamic(
  () => import("@/components/templates/previews/VogueNailsBuilderPreview"),
  { ssr: false, loading: () => <PreviewLoading /> }
);

function PreviewLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-caleno-border bg-slate-50">
      <p className="text-sm text-caleno-deep/80">טוען תצוגה מקדימה…</p>
    </div>
  );
}

function PreviewBody({ id }: { id: PublicSiteTemplateId }) {
  switch (id) {
    case "hair-luxury":
      return <HairLuxuryBuilderPreview />;
    case "gentlemans-barber":
      return <GentlemansBarberBuilderPreview />;
    case "vogue-nails":
      return <VogueNailsBuilderPreview />;
    default:
      return <HairLuxuryBuilderPreview />;
  }
}

export type BuilderTemplateSelectorProps = {
  selectedId: PublicSiteTemplateId;
  onSelect: (id: PublicSiteTemplateId) => void;
};

export function BuilderTemplateSelector({
  selectedId,
  onSelect,
}: BuilderTemplateSelectorProps) {
  const [previewId, setPreviewId] = useState<PublicSiteTemplateId | null>(null);
  const closePreview = useCallback(() => setPreviewId(null), []);

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border border-caleno-border/80 bg-gradient-to-br from-[#F8FCFD] to-white p-4 text-right shadow-[0_8px_30px_-18px_rgba(15,23,42,0.12)] ring-1 ring-black/[0.03] sm:p-5"
        dir="rtl"
      >
        <p className="text-sm font-medium leading-relaxed text-caleno-ink">
          בחרו סגנון שמתאים לכם! אל דאגה — אפשר לשנות לגמרי צבעים, טקסטים ותמונות אחר כך
          מלוח הבקרה. זה רק נקודת התחלה.
        </p>
        <p
          className="mt-3 text-xs leading-relaxed text-[#64748B]"
          dir="ltr"
          lang="en"
        >
          Pick a vibe that fits your style! Don&apos;t worry—you can fully customize all
          colors, text, and images later from your Admin Dashboard. This is just your
          starting point.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BUILDER_PUBLIC_TEMPLATES.map((t) => {
          const selected = selectedId === t.id;
          return (
            <Card
              key={t.id}
              className={cn(
                "relative gap-0 overflow-hidden border py-0 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.25)] transition-[box-shadow,border-color,transform] duration-200",
                selected
                  ? "border-caleno-deep ring-2 ring-caleno-deep/25"
                  : "border-caleno-border hover:border-caleno-deep/35 hover:shadow-[0_14px_44px_-20px_rgba(15,23,42,0.2)]"
              )}
            >
              {selected && (
                <div
                  className="absolute left-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-caleno-deep text-white shadow-md"
                  aria-hidden
                >
                  <Check className="h-4 w-4 stroke-[2.5]" />
                </div>
              )}
              <CardContent className="space-y-0 p-0">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <Image
                    src={t.thumbnailSrc}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <div className="absolute bottom-0 right-0 left-0 p-3 text-right text-white">
                    <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-white/85">
                      {t.nameEn}
                    </p>
                    <p className="text-base font-bold leading-tight">{t.nameHe}</p>
                  </div>
                </div>
                <div className="space-y-1 px-4 pb-3 pt-3 text-right">
                  <p className="text-xs leading-relaxed text-[#64748B]">{t.taglineHe}</p>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2 border-t border-caleno-border/60 bg-[#FAFBFC] px-4 py-3 sm:flex-row sm:justify-stretch">
                <button
                  type="button"
                  onClick={() => setPreviewId(t.id)}
                  className="w-full rounded-lg border border-caleno-border bg-white px-3 py-2 text-sm font-medium text-caleno-ink shadow-sm transition-colors hover:border-caleno-deep/40 hover:bg-[rgba(30,111,124,0.06)]"
                >
                  תצוגה חיה
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2 text-sm font-semibold shadow-sm transition-colors",
                    selected
                      ? "bg-caleno-deep text-white"
                      : "bg-caleno-ink text-white hover:bg-[#1E293B]"
                  )}
                >
                  {selected ? "נבחר" : "בחר"}
                </button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {previewId ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/55 p-3 backdrop-blur-sm sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="builder-template-preview-title"
          onClick={closePreview}
        >
          <div
            className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-caleno-border bg-white px-4 py-3">
              <h2
                id="builder-template-preview-title"
                className="text-right text-sm font-semibold text-caleno-ink sm:text-base"
              >
                תצוגה חיה —{" "}
                {BUILDER_PUBLIC_TEMPLATES.find((x) => x.id === previewId)?.nameHe}
              </h2>
              <button
                type="button"
                onClick={closePreview}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-caleno-border text-caleno-ink transition-colors hover:bg-slate-50"
                aria-label="סגור תצוגה"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-100/90 p-3 sm:p-4">
              <PreviewBody id={previewId} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
