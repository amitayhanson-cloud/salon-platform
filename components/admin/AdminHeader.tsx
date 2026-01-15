"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";

type MenuItem = {
  label: string;
  href?: string;
  items?: { label: string; href: string }[];
};

function getMenuItems(siteId: string): MenuItem[] {
  return [
    {
      label: "ניהול אתר",
      items: [
        { label: "הגדרות", href: `/site/${siteId}/admin/settings` },
        { label: "מחירים", href: `/site/${siteId}/admin/prices` },
        { label: "צבעים", href: `/site/${siteId}/admin/colours` },
        { label: "תמונות", href: `/site/${siteId}/admin/pictures` },
      ],
    },
    {
      label: "צוות",
      items: [
        { label: "עובדים", href: `/site/${siteId}/admin/team/workers` },
        { label: "משכורות", href: `/site/${siteId}/admin/team/salary` },
      ],
    },
    {
      label: "לקוחות",
      items: [
        { label: "כרטיס לקוח", href: `/site/${siteId}/admin/clients/client-card` },
      ],
    },
  {
    label: "יומן",
    href: `/site/${siteId}/admin/bookings`,
  },
  ];
}

export default function AdminHeader() {
  const pathname = usePathname();
  const params = useParams();
  const siteId = params?.siteId as string;
  const menuItems = siteId ? getMenuItems(siteId) : [];
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

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
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex-shrink-0">
            <Link
              href={siteId ? `/site/${siteId}/admin` : "/admin"}
              className="text-xl font-bold text-slate-900 hover:text-sky-600 transition-colors"
            >
              פאנל ניהול
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 space-x-reverse">
            {menuItems.map((item) => (
              <div key={item.label} className="relative">
                {item.href ? (
                  <Link
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive(item.href)
                        ? "bg-sky-100 text-sky-700"
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
                          ? "bg-sky-100 text-sky-700"
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
                                ? "bg-sky-50 text-sky-700 font-medium"
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

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="תפריט"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
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
                        ? "bg-sky-50 text-sky-700"
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
                          ? "bg-sky-50 text-sky-700"
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
                                ? "bg-sky-100 text-sky-700 font-medium"
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
          </nav>
        )}
      </div>

    </header>
  );
}
