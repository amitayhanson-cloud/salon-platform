"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useParams, useRouter } from "next/navigation";
import { ChevronDown, Menu, X, ExternalLink, Sparkles } from "lucide-react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { useAuth } from "@/components/auth/AuthProvider";
import { isOnTenantSubdomainClient, getAdminBasePath } from "@/lib/url";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";

type SubMenuItem = {
  label: string;
  href: string;
  items?: { label: string; href: string }[];
};

type MenuItem = {
  label: string;
  href?: string;
  items?: SubMenuItem[];
};

function getMenuItems(basePath: string): MenuItem[] {
  // Nav order (LTR): View Website first, then these. Desired RTL: User logo | ניהול אתר | צוות | לקוחות | יומן | לוח בקרה | צפייה באתר
  return [
    {
      label: "לוח בקרה",
      href: basePath,
    },
    {
      label: "יומן",
      href: `${basePath}/bookings`,
    },
    {
      label: "לקוחות",
      items: [
        { label: "כרטיס לקוח", href: `${basePath}/clients/client-card` },
        { label: "הגדרות לקוחות", href: `${basePath}/clients/settings` },
      ],
    },
    {
      label: "צוות",
      items: [
        { label: "עובדים", href: `${basePath}/team/workers` },
        { label: "ביצועי צוות", href: `${basePath}/team/salary` },
      ],
    },
    {
      label: "ניהול אתר",
      items: [
        { label: "אתר", href: `${basePath}/site` },
        { label: "הגדרות", href: `${basePath}/settings` },
        { label: "שירותים", href: `${basePath}/services` },
      ],
    },
  ];
}

type AdminHeaderProps = {
  onOpenHelp?: () => void;
};

export default function AdminHeader({ onOpenHelp }: AdminHeaderProps) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const siteId = params?.siteId as string | null;
  const { user, loading: authLoading } = useAuth();
  const adminBasePath =
    !siteId || siteId === "me"
      ? "/site/me/admin"
      : getAdminBasePath(siteId, isOnTenantSubdomainClient());
  const menuItems = getMenuItems(adminBasePath);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

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

  // Get public site URL: on tenant subdomain use /; on root use path without /admin
  const getPublicPath = (): string => {
    if (isOnTenantSubdomainClient()) return "/";
    const publicPath = pathname.replace(/\/admin(\/.*)?$/, "");
    return publicPath || "/";
  };

  // Handle button click - open public site in NEW TAB
  const handleViewWebsite = () => {
    const publicPath = getPublicPath();
    const fullUrl = `${window.location.origin}${publicPath}`;
    window.open(fullUrl, "_blank", "noopener,noreferrer");
  };

  const canViewSite = !authLoading && !!user;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
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
    <header ref={headerRef} className="sticky top-0 z-[100] pt-3 pb-2 px-4 sm:px-6 lg:px-8">
      <div
        className="max-w-7xl mx-auto rounded-xl md:rounded-full border border-white/30 bg-white/25 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(255,255,255,0.4)_inset] backdrop-blur-xl px-4 sm:px-6 md:px-6"
        style={{ WebkitBackdropFilter: "blur(16px)" }}
      >
        {/* dir=ltr so left/right zones stay fixed: left = Caleno, right = tenant+nav */}
        <div className="flex items-center justify-between h-14 w-full" dir="ltr">
          {/* LEFT: Caleno logo — match landing page position/sizing */}
          <div className="flex shrink-0">
            <Link
              href={adminBasePath}
              className="relative flex shrink-0 items-center py-1 transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2 rounded"
              aria-label="Caleno – פאנל ניהול"
            >
              <span className="relative block h-9 w-[140px] shrink-0 md:h-11 md:min-w-[180px] md:w-[205px]">
                <Image
                  src="/brand/caleno logo/caleno_logo_new.png"
                  alt="Caleno"
                  fill
                  className="object-contain object-left"
                  priority
                  sizes="(max-width: 768px) 140px, 205px"
                />
              </span>
            </Link>
          </div>

          {/* RIGHT: tenant branding + navbar (one cluster) */}
          <div className="flex items-center gap-4 md:gap-6 shrink-0">
            {/* Navbar */}
            <nav className="hidden md:flex items-center gap-4 whitespace-nowrap">
              {onOpenHelp && (
                <HoverBorderGradient
                  as="button"
                  type="button"
                  onClick={onOpenHelp}
                  containerClassName="rounded-full"
                  className="flex items-center gap-2 text-sm font-medium"
                  title="עזרה בפאנל (AI)"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>עזרה</span>
                </HoverBorderGradient>
              )}
              {canViewSite && (
                <button
                  onClick={handleViewWebsite}
                  className="flex items-center gap-2 rounded-full border border-emerald-200/60 bg-emerald-50/50 px-4 py-2 text-sm font-medium text-[#0F172A] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06),0_0_0_1px_rgba(255,255,255,0.5)_inset] backdrop-blur-xl transition-colors hover:bg-emerald-100/60 hover:border-emerald-300/60"
                  style={{ WebkitBackdropFilter: "blur(16px)" }}
                  title="צפייה באתר הציבורי"
                >
                  <span>צפייה באתר</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              {menuItems.map((item) => (
                <div key={item.label} className="relative">
                      {item.href ? (
                    <Link
                      href={item.href}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors backdrop-blur-md ${
                        isActive(item.href)
                          ? "text-[#0F172A] bg-[rgba(204,238,241,0.7)] border border-[rgba(30,111,124,0.25)] shadow-[0_2px_10px_-2px_rgba(30,111,124,0.15),0_0_0_1px_rgba(255,255,255,0.4)_inset]"
                          : "text-[#0F172A] hover:bg-white/30"
                      }`}
                      style={isActive(item.href) ? { WebkitBackdropFilter: "blur(12px)" } : undefined}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleDropdown(item.label)}
                        className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-colors backdrop-blur-md ${
                          isParentActive(item)
                            ? "text-[#0F172A] bg-[rgba(204,238,241,0.7)] border border-[rgba(30,111,124,0.25)] shadow-[0_2px_10px_-2px_rgba(30,111,124,0.15),0_0_0_1px_rgba(255,255,255,0.4)_inset]"
                            : "text-[#0F172A] hover:bg-white/30"
                        }`}
                        style={isParentActive(item) ? { WebkitBackdropFilter: "blur(12px)" } : undefined}
                      >
                        {item.label}
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            openDropdown === item.label ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      {openDropdown === item.label && item.items && (
                        <div className="absolute right-0 top-full mt-1 z-[110] w-48 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white/95 shadow-xl backdrop-blur-md animate-[dropdown_0.2s_ease-out_forwards]">
                          {item.items.map((subItem) => (
                            <div key={subItem.href}>
                              <Link
                                href={subItem.href}
                                onClick={() => setOpenDropdown(null)}
                                className={`block px-4 py-2 text-sm transition-colors ${
                                  isActive(subItem.href)
                                    ? "bg-[rgba(204,238,241,0.5)] font-medium text-[#0F172A]"
                                    : "text-[#0F172A] hover:bg-[rgba(15,23,42,0.04)]"
                                }`}
                              >
                                {subItem.label}
                              </Link>
                              {subItem.items?.map((nested) => (
                                <Link
                                  key={nested.href}
                                  href={nested.href}
                                  onClick={() => setOpenDropdown(null)}
                                  className={`block border-t border-[#E2E8F0] px-4 py-2 pl-6 text-sm transition-colors ${
                                    isActive(nested.href)
                                      ? "bg-[rgba(204,238,241,0.5)] font-medium text-[#0F172A]"
                                      : "text-[#0F172A] hover:bg-[rgba(15,23,42,0.04)]"
                                  }`}
                                >
                                  {nested.label}
                                </Link>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </nav>

            {/* Tenant logo or name (far right) */}
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={adminBasePath}
                className="flex h-9 items-center text-[#0F172A] transition-colors hover:text-[#1E6F7C]"
                aria-label={siteName || "פאנל ניהול"}
              >
                {siteLogoUrl ? (
                  <img
                    src={siteLogoUrl}
                    alt={siteName || "לוגו"}
                    className="h-9 w-auto object-contain max-w-[140px] sm:max-w-[180px]"
                    width={180}
                    height={36}
                  />
                ) : (
                  <div className="max-w-[220px] truncate text-base font-semibold">
                    {siteName || "פאנל ניהול"}
                  </div>
                )}
              </Link>
            </div>

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

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 animate-[dropdown_0.2s_ease-out_forwards]">
            {menuItems.map((item) => (
              <div key={item.label} className="border-b border-[#E2E8F0] last:border-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className={`block px-4 py-3 text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? "bg-[rgba(204,238,241,0.5)] text-[#0F172A]"
                        : "text-[#0F172A] hover:bg-[rgba(15,23,42,0.04)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={() => toggleDropdown(item.label)}
                      className={`flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${
                        isParentActive(item)
                          ? "bg-[rgba(204,238,241,0.5)] text-[#0F172A]"
                          : "text-[#0F172A] hover:bg-[rgba(15,23,42,0.04)]"
                      }`}
                    >
                      {item.label}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          openDropdown === item.label ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {openDropdown === item.label && item.items && (
                      <div className="bg-[#F8FAFC]">
                        {item.items.map((subItem) => (
                          <div key={subItem.href}>
                            <Link
                              href={subItem.href}
                              className={`block px-8 py-2 text-sm transition-colors ${
                                isActive(subItem.href)
                                  ? "bg-[rgba(204,238,241,0.5)] font-medium text-[#0F172A]"
                                  : "text-[#64748B] hover:bg-[rgba(15,23,42,0.04)]"
                              }`}
                            >
                              {subItem.label}
                            </Link>
                            {subItem.items?.map((nested) => (
                              <Link
                                key={nested.href}
                                href={nested.href}
                                className={`block px-12 py-2 text-sm transition-colors ${
                                  isActive(nested.href)
                                    ? "bg-[rgba(204,238,241,0.5)] font-medium text-[#0F172A]"
                                    : "text-[#64748B] hover:bg-[rgba(15,23,42,0.04)]"
                                }`}
                              >
                                {nested.label}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {onOpenHelp && (
              <div className="mb-3 border-b border-[#E2E8F0] pb-3 pt-3">
                <HoverBorderGradient
                  as="button"
                  type="button"
                  onClick={() => {
                    onOpenHelp();
                    setMobileMenuOpen(false);
                  }}
                  containerClassName="rounded-full w-full"
                  className="flex w-full items-center justify-between gap-2 text-sm font-medium"
                >
                  <span>עזרה</span>
                  <Sparkles className="w-4 h-4 shrink-0" />
                </HoverBorderGradient>
              </div>
            )}
            {canViewSite && (
              <div className="mb-3 border-b border-[#E2E8F0] pb-3 pt-3">
                <button
                  onClick={() => {
                    handleViewWebsite();
                    setMobileMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-4 py-3 text-sm font-medium text-[#0F172A] shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)] backdrop-blur-md transition-colors hover:bg-emerald-100/60"
                >
                  <span>צפייה באתר</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            )}
          </nav>
        )}
      </div>

    </header>
  );
}
