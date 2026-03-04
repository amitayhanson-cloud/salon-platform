"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { HeroBackground } from "@/components/ui/HeroBackground";

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
              <Link href="#" className="text-gray-600 hover:text-gray-900 text-sm md:text-base">
                מדיניות פרטיות
              </Link>
              <Link href="#" className="text-gray-600 hover:text-gray-900 text-sm md:text-base">
                תנאי שימוש
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
