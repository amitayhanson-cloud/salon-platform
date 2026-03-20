"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import { Header } from "@/components/Header";
import { HeroBackground } from "@/components/ui/HeroBackground";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-landing-inter",
});

export default function MainLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

  if (pathname === "/") {
    return <>{children}</>;
  }

  if (pathname === "/builder" || pathname?.startsWith("/builder/")) {
    return <>{children}</>;
  }

  if (pathname === "/privacy" || pathname === "/terms" || pathname === "/pricing") {
    return (
      <div
        dir="ltr"
        className={`${inter.variable} ${inter.className} min-h-screen bg-white text-caleno-ink antialiased`}
      >
        <LandingHeader />
        <main>{children}</main>
        <LandingFooter />
      </div>
    );
  }

  return (
    <>
      <HeroBackground />
      <Header />
      <main className="relative z-10 overflow-x-hidden">{children}</main>
      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-right">
            <p className="text-gray-600">© {currentYear} Caleno</p>
            <div className="flex gap-6">
              <Link href="/privacy" className="text-gray-600 hover:text-gray-900 text-sm md:text-base">
                מדיניות פרטיות
              </Link>
              <Link href="/terms" className="text-gray-600 hover:text-gray-900 text-sm md:text-base">
                תנאי שימוש
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
