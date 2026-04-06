"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { Check } from "lucide-react";
import type { PublicSiteTemplateId } from "@/types/siteConfig";
import { BUILDER_PUBLIC_TEMPLATES } from "@/components/templates/builderPublicTemplates";
import { Card } from "@/components/ui/card";
import { LivePreviewModal } from "@/components/builder/LivePreviewModal";
import { PhoneMockupFrame } from "@/components/builder/PhoneMockupFrame";
import { cn } from "@/lib/utils";

function builderTemplatePreviewIframeSrc(id: PublicSiteTemplateId): string {
  return `/preview/builder-template/${id}`;
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
    <>
      {/* Mobile: RTL horizontal carousel (~85vw + peek). Desktop+: grid. */}
      <div
        dir="rtl"
        className={cn(
          "flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]",
          "sm:grid sm:grid-cols-2 sm:gap-4 sm:snap-none sm:overflow-visible sm:pb-0 lg:grid-cols-3"
        )}
      >
        {BUILDER_PUBLIC_TEMPLATES.map((t) => {
          const selected = selectedId === t.id;
          return (
            <Card
              key={t.id}
              className={cn(
                "relative w-[68vw] min-w-[68vw] max-w-[68vw] shrink-0 snap-center snap-always overflow-hidden border-0 py-0 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.25)] transition-[box-shadow,transform] duration-200",
                "sm:w-auto sm:min-w-0 sm:max-w-none",
                selected
                  ? "ring-2 ring-caleno-deep shadow-[0_0_0_3px_rgba(30,111,124,0.22),0_16px_48px_-20px_rgba(30,111,124,0.35)]"
                  : "ring-1 ring-black/[0.06] hover:shadow-[0_14px_44px_-20px_rgba(15,23,42,0.2)]"
              )}
            >
              {selected && (
                <div
                  className="absolute start-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-caleno-deep text-white shadow-[0_4px_14px_rgba(30,111,124,0.55)] ring-2 ring-white/90 sm:start-3 sm:top-3 sm:h-12 sm:w-12"
                  aria-hidden
                >
                  <Check className="h-5 w-5 stroke-[2.5] sm:h-7 sm:w-7" />
                </div>
              )}
              <div
                className={cn(
                  "relative aspect-[3/2] w-full overflow-hidden bg-slate-100 sm:aspect-[16/11]",
                  selected && "ring-2 ring-inset ring-caleno-deep"
                )}
              >
                <Image
                  src={t.thumbnailSrc}
                  alt={t.nameHe}
                  fill
                  className="object-cover"
                  sizes="(max-width: 639px) 68vw, (max-width: 1023px) 45vw, 33vw"
                  loading="lazy"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 from-[18%] to-transparent sm:from-25%"
                  aria-hidden
                />
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2 pt-7 text-right sm:gap-2.5 sm:p-3.5 sm:pt-12">
                  <div className="space-y-0 sm:space-y-0.5">
                    <p className="text-[0.55rem] font-semibold uppercase tracking-wider text-white/80 sm:text-[0.65rem]">
                      {t.nameEn}
                    </p>
                    <p className="text-sm font-bold leading-tight text-white sm:text-lg">
                      {t.nameHe}
                    </p>
                    <p className="line-clamp-2 text-[0.65rem] leading-snug text-white/88 sm:line-clamp-none sm:text-xs sm:leading-relaxed">
                      {t.taglineHe}
                    </p>
                  </div>
                  <div className="flex flex-row gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(t.id)}
                      className={cn(
                        "min-h-8 flex-1 rounded-lg px-1.5 py-1 text-center text-[0.65rem] font-semibold shadow-sm transition-colors sm:min-h-10 sm:rounded-xl sm:px-2 sm:py-2 sm:text-sm",
                        selected
                          ? "bg-caleno-deep text-white"
                          : "bg-white/95 text-caleno-ink hover:bg-white"
                      )}
                    >
                      {selected ? "נבחר" : "בחר"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewId(t.id)}
                      className="min-h-8 flex-1 rounded-lg border border-white/40 bg-white/15 px-1.5 py-1 text-center text-[0.65rem] font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-white/25 sm:min-h-10 sm:rounded-xl sm:px-2 sm:py-2 sm:text-sm"
                    >
                      תצוגה חיה
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {previewId ? (
        <LivePreviewModal
          open
          onClose={closePreview}
          titleId="builder-template-preview-title"
          title={`תצוגה חיה — ${BUILDER_PUBLIC_TEMPLATES.find((x) => x.id === previewId)?.nameHe ?? ""}`}
        >
          <PhoneMockupFrame
            iframeSrc={builderTemplatePreviewIframeSrc(previewId)}
            iframeTitle={`תצוגה חיה — ${BUILDER_PUBLIC_TEMPLATES.find((x) => x.id === previewId)?.nameHe ?? ""}`}
          />
        </LivePreviewModal>
      ) : null}
    </>
  );
}
