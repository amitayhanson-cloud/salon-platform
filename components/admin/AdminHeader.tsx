"use client";

import { useState, useEffect, useRef, useLayoutEffect, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import {
  ChevronDown,
  Menu,
  X,
  ExternalLink,
  Sparkles,
  CalendarDays,
  LayoutDashboard,
  Users,
  UsersRound,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTenantInfo } from "@/hooks/useTenantInfo";
import {
  isOnTenantSubdomainClient,
  getAdminBasePath,
  getPublicLandingPageUrlForSiteClient,
} from "@/lib/url";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";

type SubMenuItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  items?: { label: string; href: string }[];
};

type MenuItem = {
  label: string;
  href?: string;
  /** Optional icon for top-level nav links */
  icon?: LucideIcon;
  items?: SubMenuItem[];
};

function AiSparklesGradientIcon({ className = "h-4 w-4" }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E3A8A" />
          <stop offset="55%" stopColor="#0F766E" />
          <stop offset="100%" stopColor="#7DD3FC" />
        </linearGradient>
      </defs>
      <path
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.937A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063A2 2 0 0 0 14.063 15.5l-1.582 6.135a.5.5 0 0 1-.962 0z"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M20 3v4" stroke={`url(#${gradientId})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M22 5h-4" stroke={`url(#${gradientId})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 17v2" stroke={`url(#${gradientId})`} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 18H3" stroke={`url(#${gradientId})`} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function getMenuItems(basePath: string): MenuItem[] {
  return [
    {
      label: "יומן",
      href: `${basePath}/bookings`,
      icon: CalendarDays,
    },
    {
      label: "לוח בקרה",
      href: basePath,
      icon: LayoutDashboard,
    },
    {
      label: "לקוחות",
      icon: Users,
      items: [
        { label: "כרטיס לקוח", href: `${basePath}/clients/client-card` },
        { label: "מרכז הודעות WhatsApp", href: `${basePath}/whatsapp` },
      ],
    },
    {
      label: "צוות",
      icon: UsersRound,
      items: [
        { label: "עובדים", href: `${basePath}/team/workers` },
        { label: "ביצועי צוות", href: `${basePath}/team/salary` },
      ],
    },
    {
      label: "ניהול אתר",
      icon: Settings2,
      items: [
        { label: "הגדרות", href: `${basePath}/settings` },
        { label: "אתר", href: `${basePath}/site` },
        { label: "שירותים", href: `${basePath}/services` },
        { label: "מוצרים", href: `${basePath}/website-management/products` },
      ],
    },
  ];
}

/** Desktop (LTR cluster): nav links to the right of business branding. */
const ADMIN_NAV_ORDER_DESKTOP = [
  "ניהול אתר",
  "צוות",
  "לקוחות",
  "יומן",
  "לוח בקרה",
] as const;

/** Mobile: dashboard first (was second after יומן). */
const ADMIN_NAV_ORDER_MOBILE = [
  "ניהול אתר",
  "צוות",
  "לקוחות",
  "יומן",
  "לוח בקרה",
] as const;

function orderAdminNavItems(
  items: MenuItem[],
  preferredOrder: readonly string[]
): MenuItem[] {
  const byLabel = new Map(items.map((i) => [i.label, i]));
  const ordered: MenuItem[] = [];
  for (const label of preferredOrder) {
    const it = byLabel.get(label);
    if (it) ordered.push(it);
  }
  for (const it of items) {
    if (!preferredOrder.includes(it.label)) ordered.push(it);
  }
  return ordered;
}

type AdminHeaderProps = {
  onOpenHelp?: () => void;
};

export default function AdminHeader({ onOpenHelp }: AdminHeaderProps) {
  const pathname = usePathname();
  const params = useParams();
  const siteId = params?.siteId as string | null;
  const { user, loading: authLoading } = useAuth();
  const { data: tenantInfo } = useTenantInfo();
  const adminBasePath =
    !siteId || siteId === "me"
      ? "/site/me/admin"
      : getAdminBasePath(siteId, isOnTenantSubdomainClient());
  const menuItems = useMemo(() => getMenuItems(adminBasePath), [adminBasePath]);
  const desktopNavItems = useMemo(
    () => orderAdminNavItems(menuItems, ADMIN_NAV_ORDER_DESKTOP),
    [menuItems]
  );
  const mobileNavItems = useMemo(
    () => orderAdminNavItems(menuItems, ADMIN_NAV_ORDER_MOBILE),
    [menuItems]
  );
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [dropdownPlacement, setDropdownPlacement] = useState<{
    top: number;
    right: number;
    minWidth: number;
  } | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);

  // Per-site branding (name + logo) from Firestore
  const [siteName, setSiteName] = useState("");
  const [siteLogoUrl, setSiteLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!siteId || siteId === "me") {
      setSiteName("");
      setSiteLogoUrl(null);
      return;
    }
    const unsub = subscribeSiteConfig(
      siteId,
      (config) => {
        setSiteName(config?.salonName ?? "");
        setSiteLogoUrl(config?.branding?.logoUrl ?? null);
      }
    );
    return unsub;
  }, [siteId]);

  const headerDisplayName = siteName.trim() || user?.name?.trim() || "פאנל ניהול";

  const publicWebsiteUrl = useMemo(() => {
    // Preferred source: resolved tenant URL (slug -> https://slug.caleno.co)
    if (tenantInfo?.publicUrl) return tenantInfo.publicUrl;

    // Resolve site id from route or tenant lookup (covers /site/me/admin)
    const resolvedSiteId =
      siteId && siteId !== "me" ? siteId : tenantInfo?.siteId && tenantInfo.siteId !== "me" ? tenantInfo.siteId : null;

    if (resolvedSiteId) {
      return getPublicLandingPageUrlForSiteClient(resolvedSiteId, tenantInfo?.slug ?? null);
    }

    // Last-resort fallback: preserve previous behavior for edge cases.
    if (isOnTenantSubdomainClient()) return `${window.location.origin}/`;
    const publicPath = pathname.replace(/\/admin(\/.*)?$/, "") || "/";
    return `${window.location.origin}${publicPath}`;
  }, [pathname, siteId, tenantInfo?.publicUrl, tenantInfo?.siteId, tenantInfo?.slug]);

  // Handle button click - open public site in NEW TAB
  const handleViewWebsite = () => {
    window.open(publicWebsiteUrl, "_blank", "noopener,noreferrer");
  };

  const canViewSite = !authLoading && !!user;

  useEffect(() => setPortalMounted(true), []);

  // Position desktop dropdown (portal) under trigger; update on scroll/resize
  useLayoutEffect(() => {
    if (!openDropdown) {
      setDropdownPlacement(null);
      return;
    }
    const update = () => {
      if (typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches) {
        setDropdownPlacement(null);
        return;
      }
      const el = triggerRefs.current[openDropdown];
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) {
        setDropdownPlacement(null);
        return;
      }
      setDropdownPlacement({
        top: r.bottom + 4,
        right: document.documentElement.clientWidth - r.right,
        minWidth: Math.max(r.width, 192),
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [openDropdown]);

  // Close dropdown when clicking outside (include portal — it renders under body)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (headerRef.current?.contains(t)) return;
      if (dropdownPortalRef.current?.contains(t)) return;
      setOpenDropdown(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenDropdown(null);
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const toggleDropdown = (label: string) => {
    setOpenDropdown(openDropdown === label ? null : label);
  };

  const isActive = (href: string) => {
    return pathname === href;
  };

  const isSubItemActive = (subItem: SubMenuItem): boolean => {
    if (isActive(subItem.href)) return true;
    return (subItem.items ?? []).some((nested) => isActive(nested.href));
  };

  const isParentActive = (item: MenuItem) => {
    if (item.href) {
      return isActive(item.href);
    }
    if (item.items) {
      return item.items.some((subItem) =>
        isSubItemActive(subItem)
      );
    }
    return false;
  };

  // Close dropdown when route changes. Do NOT auto-open when path matches a dropdown item:
  // that caused the "ניהול אתר" dropdown to be open by default after a full page refresh,
  // because the effect ran on mount/hydration and set openDropdown to the parent label.
  // Active section is shown via isParentActive() styling on the trigger instead.
  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-[100] bg-transparent pb-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:px-6 lg:px-8"
    >
      <div className="max-w-7xl mx-auto rounded-xl border border-[#E9F4F7] bg-[#FCFEFF] px-4 shadow-sm md:rounded-full md:shadow-md sm:px-6 md:px-6">
        {/* dir=ltr: left = business branding, right = nav */}
        <div className="flex items-center justify-between h-14 w-full" dir="ltr">
          <div className="flex min-w-0 shrink-0 items-center pe-2">
            <Link
              href={adminBasePath}
              className="flex h-9 min-w-0 items-center text-[#0F172A] transition-colors hover:text-[#1E6F7C]"
              aria-label={headerDisplayName}
            >
              {siteLogoUrl ? (
                <img
                  src={siteLogoUrl}
                  alt={headerDisplayName}
                  className="h-8 w-auto max-w-[140px] object-contain md:h-9 md:max-w-[200px]"
                  width={200}
                  height={36}
                />
              ) : (
                <div className="max-w-[150px] truncate text-sm font-semibold md:max-w-[240px] md:text-base">
                  {headerDisplayName}
                </div>
              )}
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-4 md:gap-6">
            {/* Navbar */}
            <nav dir="rtl" className="hidden md:flex items-center gap-2 whitespace-nowrap rounded-full bg-[#FBFEFF] px-2 py-1">
              {desktopNavItems.map((item) => (
                <div key={item.label} className="relative">
                      {item.href ? (
                    (() => {
                      const NavIcon = item.icon;
                      return (
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        isActive(item.href)
                          ? "bg-[#1E6F7C] text-white shadow-sm"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className={`rounded-lg p-1.5 ${isActive(item.href) ? "bg-white/20" : "bg-slate-100"}`}>
                        {NavIcon ? (
                          <NavIcon className={`h-4 w-4 shrink-0 ${isActive(item.href) ? "text-white" : "text-[#1E6F7C]"}`} aria-hidden />
                        ) : null}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                      );
                    })()
                  ) : (
                    <>
                    {(() => {
                      const NavIcon = item.icon;
                      return (
                      <button
                        type="button"
                        ref={(el) => {
                          if (el) triggerRefs.current[item.label] = el;
                          else delete triggerRefs.current[item.label];
                        }}
                        onClick={() => toggleDropdown(item.label)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        isParentActive(item)
                            ? "bg-[#1E6F7C] text-white shadow-sm"
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span className={`rounded-lg p-1.5 ${isParentActive(item) ? "bg-white/20" : "bg-slate-100"}`}>
                          {NavIcon ? (
                            <NavIcon className={`h-4 w-4 shrink-0 ${isParentActive(item) ? "text-white" : "text-[#1E6F7C]"}`} aria-hidden />
                          ) : null}
                        </span>
                        {item.label}
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            openDropdown === item.label ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      );
                    })()}
                    </>
                  )}
                </div>
              ))}
              {canViewSite && (
                <button
                  onClick={handleViewWebsite}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                  title="צפייה באתר הציבורי"
                >
                  <span className="rounded-lg bg-slate-100 p-1.5">
                    <ExternalLink className="w-4 h-4 text-[#1E6F7C]" />
                  </span>
                  <span>צפייה באתר</span>
                </button>
              )}
              {onOpenHelp && (
                <button
                  type="button"
                  onClick={onOpenHelp}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                  title="עזרה בפאנל (AI)"
                >
                  <span className="rounded-lg bg-slate-100 p-1.5">
                    <AiSparklesGradientIcon className="w-4 h-4 shrink-0" />
                  </span>
                  <span>עזרה</span>
                </button>
              )}
            </nav>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="shrink-0 rounded-lg p-2 text-[#0F172A] transition-colors hover:bg-[rgba(15,23,42,0.04)] md:hidden"
              aria-label="תפריט"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <>
            <button
              type="button"
              aria-label="סגור תפריט"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 z-[109] bg-black/40"
            />
            <nav className="md:hidden fixed right-0 top-0 z-[110] h-full w-[62.5vw] overflow-y-auto border-l border-slate-100 bg-white shadow-2xl animate-[slide-in-right_0.22s_ease-out_forwards]">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">ניווט</p>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                  aria-label="סגור"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="backdrop-blur-lg pb-3">
            {mobileNavItems.map((item) => (
              <div key={item.label} className="border-b border-slate-100/80 last:border-0">
                {item.href ? (
                  (() => {
                    const NavIcon = item.icon;
                    return (
                  <Link
                    href={item.href}
                    className={`mx-3 my-1 flex w-[calc(100%-1.5rem)] items-center rounded-xl px-3 py-3.5 text-sm font-semibold transition-colors duration-200 active:scale-[0.99] ${
                      isActive(item.href)
                        ? "bg-[#1E6F7C] text-white shadow-sm"
                        : "text-slate-700 hover:bg-[#EEF8FA] active:bg-[#EEF8FA]"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`rounded-lg p-2 ${isActive(item.href) ? "bg-white/20" : "bg-slate-100/70"}`}>
                        {NavIcon ? (
                          <NavIcon className={`h-4 w-4 shrink-0 ${isActive(item.href) ? "text-white" : "text-[#1E6F7C]"}`} aria-hidden />
                        ) : null}
                      </span>
                      <span className="font-semibold">{item.label}</span>
                    </span>
                  </Link>
                    );
                  })()
                ) : (
                  <>
                    {(() => {
                      const NavIcon = item.icon;
                      return (
                    <button
                      onClick={() => toggleDropdown(item.label)}
                      className={`mx-3 my-1 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-xl px-3 py-3.5 text-sm font-semibold transition-colors duration-200 active:scale-[0.99] ${
                        isParentActive(item)
                          ? "bg-[#1E6F7C] text-white shadow-sm"
                          : "text-slate-700 hover:bg-[#EEF8FA] active:bg-[#EEF8FA]"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`rounded-lg p-2 ${isParentActive(item) ? "bg-white/20" : "bg-slate-100/70"}`}>
                          {NavIcon ? (
                            <NavIcon className={`h-4 w-4 shrink-0 ${isParentActive(item) ? "text-white" : "text-[#1E6F7C]"}`} aria-hidden />
                          ) : null}
                        </span>
                        <span>{item.label}</span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          openDropdown === item.label ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                      );
                    })()}
                    {openDropdown === item.label && item.items && (
                      <div className="bg-slate-50/80 pb-1">
                        {item.items.map((subItem) => {
                          const SubIcon = subItem.icon;
                          return (
                          <div key={subItem.href}>
                            <Link
                              href={subItem.href}
                              className={`mx-3 my-1 flex items-center rounded-xl px-3 py-3 text-sm font-semibold transition-colors duration-200 ${
                                isActive(subItem.href)
                                  ? "bg-[#E6F5F7] text-[#1E6F7C]"
                                  : "text-slate-600 hover:bg-[#eaf5f8]"
                              }`}
                            >
                              <span className="flex items-center gap-3">
                                {SubIcon ? (
                                  <span className="rounded-lg bg-white/80 p-1.5">
                                    <SubIcon className="h-3.5 w-3.5 shrink-0 text-[#1E6F7C]" aria-hidden />
                                  </span>
                                ) : null}
                                <span>{subItem.label}</span>
                              </span>
                            </Link>
                            {subItem.items?.map((nested) => (
                              <Link
                                key={nested.href}
                                href={nested.href}
                                className={`mx-3 my-1 block rounded-xl px-6 py-2.5 text-sm font-medium transition-colors duration-200 ${
                                  isActive(nested.href)
                                    ? "bg-[#E6F5F7] text-[#1E6F7C]"
                                    : "text-slate-600 hover:bg-[#eaf5f8]"
                                }`}
                              >
                                {nested.label}
                              </Link>
                            ))}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            </div>
            <div className="my-1 border-t border-slate-200/80" />
            {canViewSite && (
              <div className="mb-1">
                <button
                  onClick={() => {
                    handleViewWebsite();
                    setMobileMenuOpen(false);
                  }}
                  className="mx-3 flex h-12 w-[calc(100%-1.5rem)] items-center justify-between rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100/70 active:bg-slate-100"
                >
                  <span className="flex flex-row-reverse items-center gap-2.5">
                    <span>צפייה באתר</span>
                    <span className="rounded-lg bg-slate-100/80 p-2">
                      <ExternalLink className="h-4 w-4 text-[#0f5d67]" />
                    </span>
                  </span>
                </button>
              </div>
            )}
            {onOpenHelp && (
              <div className="mb-1">
                <button
                  type="button"
                  onClick={() => {
                    onOpenHelp();
                    setMobileMenuOpen(false);
                  }}
                  className="mx-3 flex h-12 w-[calc(100%-1.5rem)] items-center justify-between rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100/70 active:bg-slate-100"
                >
                  <span className="flex flex-row-reverse items-center gap-2.5">
                    <span>עזרה</span>
                    <span className="rounded-lg bg-slate-100/80 p-2">
                      <AiSparklesGradientIcon className="h-4 w-4" />
                    </span>
                  </span>
                </button>
              </div>
            )}
            </nav>
          </>
        )}
      </div>

      {portalMounted &&
        openDropdown &&
        dropdownPlacement &&
        (() => {
          const item = menuItems.find((i) => i.label === openDropdown && i.items);
          if (!item?.items) return null;
          return createPortal(
            <div
              ref={dropdownPortalRef}
              dir="rtl"
              className="fixed z-[300] overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-xl animate-[dropdown_0.2s_ease-out_forwards]"
              style={{
                top: dropdownPlacement.top,
                right: dropdownPlacement.right,
                minWidth: dropdownPlacement.minWidth,
              }}
            >
              {item.items.map((subItem) => {
                const SubIcon = subItem.icon;
                return (
                <div key={subItem.href}>
                  <Link
                    href={subItem.href}
                    onClick={() => setOpenDropdown(null)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors duration-200 ${
                      isActive(subItem.href)
                        ? "bg-[rgba(204,238,241,0.5)] font-medium text-[#0F172A]"
                        : "text-[#0F172A] hover:bg-caleno-50"
                    }`}
                  >
                    {SubIcon ? (
                      <SubIcon className="w-4 h-4 shrink-0 text-[#1E6F7C]" aria-hidden />
                    ) : null}
                    <span>{subItem.label}</span>
                  </Link>
                  {subItem.items?.map((nested) => (
                    <Link
                      key={nested.href}
                      href={nested.href}
                      onClick={() => setOpenDropdown(null)}
                      className={`block border-t border-[#E2E8F0] px-4 py-2 pl-6 text-sm transition-colors duration-200 ${
                        isActive(nested.href)
                          ? "bg-[rgba(204,238,241,0.5)] font-medium text-[#0F172A]"
                          : "text-[#0F172A] hover:bg-caleno-50"
                      }`}
                    >
                      {nested.label}
                    </Link>
                  ))}
                </div>
                );
              })}
            </div>,
            document.body
          );
        })()}
    </header>
  );
}
