import Link from "next/link";
import { Header } from "@/components/Header";
import { LandingBackground } from "@/components/hero/LandingBackground";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <LandingBackground />
      <Header />
      <main className="relative z-10">{children}</main>
      {/* Main website footer */}
      <footer className="bg-white border-t border-[#E2EEF2] py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-right">
            <p className="text-[#475569]">
              © {currentYear} Caleno
            </p>
            <div className="flex gap-6">
              <Link
                href="#"
                className="text-[#2EC4C6] hover:text-[#22A6A8] transition-colors text-sm md:text-base"
              >
                מדיניות פרטיות
              </Link>
              <Link
                href="#"
                className="text-[#2EC4C6] hover:text-[#22A6A8] transition-colors text-sm md:text-base"
              >
                תנאי שימוש
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
