"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useParams, useRouter } from "next/navigation";
import { ChevronDown, Menu, X, ExternalLink } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { isOnTenantSubdomainClient, getAdminBasePath } from "@/lib/url";
import { subscribeSiteConfig } from "@/lib/firestoreSiteConfig";

type MenuItem = {
  label: string;
  href?: string;
  items?: { label: string; href: string }[];
};

function getMenuItems(basePath: string): MenuItem[] {
  // Nav order (LTR): View Website first, then these. Desired RTL: User logo | ניהול אתר | צוות | לקוחות | יומן | צפייה באתר
  return [
    {
      label: "יומן",
      href: `${basePath}/bookings`,
    },
    {
      label: "לקוחות",
      items: [
        { label: "כרטיס לקוח", href: `${basePath}/clients/client-card` },
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
        { label: "הגדרות", href: `${basePath}/settings` },
        { label: "ייבוא CSV/Excel", href: `${basePath}/settings/import` },
        { label: "שירותים", href: `${basePath}/services` },
        { label: "צבעים", href: `${basePath}/colours` },
        { label: "תמונות", href: `${basePath}/pictures` },
      ],
    },
  ];
}

export default function AdminHeader() {
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

  const isParentActive = (item: MenuItem) => {
    if (item.href) {
      return isActive(item.href);
    }
    if (item.items) {
      return item.items.some((subItem) => isActive(subItem.href));
    }
    return false;
  };

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* dir=ltr so left/right zones stay fixed: left = Caleno, right = tenant+nav */}
        <div className="flex items-center justify-between h-16 w-full" dir="ltr">
          {/* LEFT: Caleno logo */}
          <div className="flex items-center shrink-0">
            <Link
              href={adminBasePath}
              className="flex items-center h-10 md:h-12 text-[#2EC4C6] hover:text-[#22A6A8] transition-colors"
              aria-label="Caleno – פאנל ניהול"
            >
              <Image
                src="/brand/caleno logo/Untitled design.svg"
                alt="Caleno"
                width={160}
                height={48}
                className="h-10 md:h-12 w-auto object-contain"
                priority
              />
            </Link>
          </div>

          {/* RIGHT: tenant branding + navbar (one cluster) */}
          <div className="flex items-center gap-4 md:gap-6 shrink-0">
            {/* Navbar */}
            <nav className="hidden md:flex items-center gap-4 whitespace-nowrap">
              {canViewSite && (
                <button
                  onClick={handleViewWebsite}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 flex items-center gap-2"
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
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isActive(item.href)
                          ? "bg-caleno-100 text-caleno-700"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleDropdown(item.label)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                          isParentActive(item)
                            ? "bg-caleno-100 text-caleno-700"
                            : "text-slate-700 hover:bg-slate-100"
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
                        <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-[dropdown_0.2s_ease-out_forwards]">
                          {item.items.map((subItem) => (
                            <Link
                              key={subItem.href}
                              href={subItem.href}
                              onClick={() => setOpenDropdown(null)}
                              className={`block px-4 py-2 text-sm transition-colors ${
                                isActive(subItem.href)
                                  ? "bg-caleno-50 text-caleno-700 font-medium"
                                  : "text-slate-700 hover:bg-slate-50"
                              }`}
                            >
                              {subItem.label}
                            </Link>
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
                className="flex items-center h-9 text-slate-900 hover:text-slate-700 transition-colors"
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
              className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
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
              <div key={item.label} className="border-b border-slate-100 last:border-0">
                {item.href ? (
                  <Link
                    href={item.href}
                    className={`block px-4 py-3 text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? "bg-caleno-50 text-caleno-700"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <>
                    <button
                      onClick={() => toggleDropdown(item.label)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${
                        isParentActive(item)
                          ? "bg-caleno-50 text-caleno-700"
                          : "text-slate-700 hover:bg-slate-50"
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
                      <div className="bg-slate-50">
                        {item.items.map((subItem) => (
                          <Link
                            key={subItem.href}
                            href={subItem.href}
                            className={`block px-8 py-2 text-sm transition-colors ${
                              isActive(subItem.href)
                                ? "bg-caleno-100 text-caleno-700 font-medium"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {canViewSite && (
              <div className="border-b border-slate-100 pb-3 mb-3 pt-3">
                <button
                  onClick={() => {
                    handleViewWebsite();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full px-4 py-3 text-sm font-medium transition-colors border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg flex items-center justify-between"
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
