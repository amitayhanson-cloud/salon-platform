import type { CSSProperties, ReactNode } from "react";

export function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#25D366"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"
      />
    </svg>
  );
}

/** Brand palette: #071219 ink, #417374 #3c7a8d #4e979f #7ac7d4 teals. */
export const brandInk = "#071219";
export const brandTealDeep = "#417374";
export const brandTealMid = "#3c7a8d";
export const brandTeal = "#4e979f";
export const brandTealLight = "#7ac7d4";

/** Inputs: light frosted fields; focus uses #4e979f / #7ac7d4. */
export const v0InputGlassClass =
  "h-12 rounded-xl border border-white/55 bg-white/50 py-3 text-base text-[#071219] shadow-[0_1px_2px_rgba(7,18,25,0.06)] placeholder:text-[#417374]/45 backdrop-blur-sm transition-all focus-visible:border-[#4e979f] focus-visible:ring-2 focus-visible:ring-[#7ac7d4]/40 focus-visible:ring-offset-0";

/** Divider between form and social sign-in. */
export function AuthOrDivider() {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-[#071219]/12" />
      <span className="shrink-0 font-sans text-[11px] font-semibold tracking-wide text-[#417374]">
        או המשיכו עם
      </span>
      <div className="h-px flex-1 bg-[#071219]/12" />
    </div>
  );
}

export const liquidGlassSocialButtonClass =
  "glass-effect hover-lift ripple-effect h-12 w-full justify-center rounded-xl border border-white/45 bg-white/30 px-4 font-sans text-sm font-medium text-[#071219] shadow-sm backdrop-blur-md transition-colors hover:bg-white/45 hover:text-[#3c7a8d] disabled:cursor-not-allowed disabled:opacity-45";

/** Outer mesh: brand teals + subtle #071219 depth. */
export function V0AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="v0-liquid-auth relative flex min-h-screen items-center justify-center overflow-hidden p-4 sm:p-6">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[#e8f3f5]" />

      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-40 h-[min(110vw,32rem)] w-[min(110vw,32rem)] rounded-full bg-[#4e979f]/68 blur-[96px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[8%] -right-36 h-[min(95vw,26rem)] w-[min(95vw,26rem)] rounded-full bg-[#7ac7d4]/62 blur-[80px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-18%] left-[5%] h-[min(95vw,26rem)] w-[min(95vw,26rem)] rounded-full bg-[#3c7a8d]/64 blur-[80px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[44%] left-[15%] h-[22rem] w-[22rem] -translate-y-1/2 rounded-full bg-[#7ac7d4]/50 blur-[68px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[20%] right-[18%] h-[16rem] w-[16rem] rounded-full bg-[#417374]/58 blur-[64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/2 h-[14rem] w-[min(100%,36rem)] -translate-x-1/2 rounded-full bg-[#071219]/14 blur-[72px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/12 via-transparent to-[#071219]/10"
      />

      {children}
    </div>
  );
}

/** Glass card: large radius, strong blur, soft float shadow (reference). */
export function v0GlassCardClassName() {
  return "relative z-10 w-full max-w-[420px] gap-0 rounded-[28px] border-0 py-0 shadow-none";
}

/** Wider glass panel for onboarding builder (template grid, forms). */
export function v0GlassBuilderCardClassName(options?: { checkout?: boolean }) {
  const max = options?.checkout ? "max-w-4xl" : "max-w-3xl";
  return `relative z-10 w-full ${max} gap-0 rounded-[28px] border-0 py-0 shadow-none`;
}

/** Native `<select>` matching {@link v0InputGlassClass}. */
export const v0SelectGlassClass = `${v0InputGlassClass} cursor-pointer appearance-auto py-2.5`;

export function v0GlassCardStyle(): CSSProperties {
  return {
    background: "rgba(255, 255, 255, 0.5)",
    backdropFilter: "blur(32px) saturate(160%)",
    WebkitBackdropFilter: "blur(32px) saturate(160%)",
    border: "1px solid rgba(255, 255, 255, 0.72)",
    boxShadow:
      "0 32px 64px -12px rgba(7, 18, 25, 0.14), 0 12px 28px -8px rgba(60, 122, 141, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
  };
}

export const liquidGlassPrimaryButtonClass =
  "hover-lift ripple-effect min-h-12 w-full rounded-xl border-0 px-4 py-3.5 font-sans text-base font-semibold text-white shadow-md transition-all";

/** Primary CTA: ink base, teal hover. */
export const liquidGlassPrimaryBrandClass = `${liquidGlassPrimaryButtonClass} bg-[#071219] hover:bg-[#417374] active:bg-[#3c7a8d]`;
