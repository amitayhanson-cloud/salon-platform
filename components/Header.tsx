"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { routeAfterAuth } from "@/lib/authRedirect";
import { getAdminBasePath, isOnTenantSubdomainClient } from "@/lib/url";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  const handleGoToDashboard = async () => {
    if (!user) return;
    try {
      const redirectPath = await routeAfterAuth(user.id);
      const path =
        redirectPath.startsWith("/site/") && redirectPath.endsWith("/admin") && isOnTenantSubdomainClient()
          ? "/admin"
          : redirectPath;
      router.replace(path);
    } catch (error) {
      console.error("Error determining redirect path:", error);
      if (user.siteId) {
        router.replace(getAdminBasePath(user.siteId, isOnTenantSubdomainClient()));
      } else {
        router.replace("/builder");
      }
    }
  };

  return (
    <header className="border-b border-[#E2EEF2] bg-white sticky top-0 z-50 h-[72px]" dir="ltr">
      <nav className="container mx-auto px-4 h-full">
        <div className="flex items-center justify-between h-full">
          <Link
            href="/"
            className="text-xl font-semibold text-[#2EC4C6] hover:text-[#22A6A8] transition-colors flex items-center shrink-0 h-10 md:h-12"
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
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            <Link
              href="#how-it-works"
              className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              איך זה עובד
            </Link>
            <Link
              href="#pricing"
              className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
            >
              מחירים
            </Link>
            {user ? (
              <>
                <button
                  onClick={handleGoToDashboard}
                  className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
                >
                  {user.name || user.email}
                </button>
                <button
                  onClick={handleLogout}
                  className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
                >
                  התנתקות
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-lg text-[#475569] hover:text-[#0F172A] transition-colors"
                >
                  התחברות
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 bg-[#2EC4C6] hover:bg-[#22A6A8] text-white rounded-lg text-lg font-medium transition-colors"
                >
                  הרשמה
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

