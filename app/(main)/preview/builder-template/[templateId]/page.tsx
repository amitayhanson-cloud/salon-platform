"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { isPublicSiteTemplateId } from "@/components/templates/builderPublicTemplates";
import type { PublicSiteTemplateId } from "@/types/siteConfig";

const HairLuxuryBuilderPreview = dynamic(
  () => import("@/components/templates/previews/HairLuxuryBuilderPreview"),
  { ssr: false, loading: () => <PreviewChrome /> }
);
const GentlemansBarberBuilderPreview = dynamic(
  () => import("@/components/templates/previews/GentlemansBarberBuilderPreview"),
  { ssr: false, loading: () => <PreviewChrome /> }
);
const VogueNailsBuilderPreview = dynamic(
  () => import("@/components/templates/previews/VogueNailsBuilderPreview"),
  { ssr: false, loading: () => <PreviewChrome /> }
);

function PreviewChrome() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center bg-[#0a0a0a] px-4">
      <p className="text-center text-sm text-white/70">טוען תצוגה…</p>
    </div>
  );
}

function PreviewForId({ id }: { id: PublicSiteTemplateId }) {
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

/**
 * Standalone page loaded inside the builder phone iframe.
 * Separate document viewport ≈ phone width → `sm:`/`md:` match mobile, not the outer desktop window.
 */
export default function BuilderTemplatePreviewFramePage() {
  const params = useParams();
  const raw = params?.templateId;
  const slug = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";

  if (!isPublicSiteTemplateId(slug)) {
    return (
      <div className="flex min-h-[40dvh] items-center justify-center bg-black p-4 text-center text-sm text-white/80">
        תצוגה לא זמינה
      </div>
    );
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full min-w-0 cursor-default overflow-y-auto overflow-x-hidden overscroll-contain bg-black touch-pan-y [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
      <div
        inert
        className="pointer-events-none min-w-0 select-none [&_*]:pointer-events-none"
      >
        <PreviewForId id={slug} />
      </div>
    </div>
  );
}
