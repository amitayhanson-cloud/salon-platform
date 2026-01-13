import Link from "next/link";
import { Header } from "@/components/Header";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <>
      <Header />
      <main>{children}</main>
      {/* Main website footer */}
      <footer className="bg-white border-t border-sky-100 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-right">
            <p className="text-slate-600">
              © {currentYear} SalonPlatform
            </p>
            <div className="flex gap-6">
              <Link
                href="#"
                className="text-sky-700 hover:text-sky-800 transition-colors text-sm md:text-base"
              >
                מדיניות פרטיות
              </Link>
              <Link
                href="#"
                className="text-sky-700 hover:text-sky-800 transition-colors text-sm md:text-base"
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
