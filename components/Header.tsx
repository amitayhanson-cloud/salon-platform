"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { routeAfterAuth } from "@/lib/authRedirect";

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
      router.replace(redirectPath);
    } catch (error) {
      console.error("Error determining redirect path:", error);
      // Fallback: check if user has siteId directly
      if (user.siteId) {
        router.replace(`/site/${user.siteId}/admin`);
      } else {
        router.replace("/builder");
      }
    }
  };

  return (
    <header className="border-b border-sky-100 bg-white sticky top-0 z-50">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xl font-semibold text-neutral-900"
          >
            SalonPlatform
          </Link>
          <div className="flex items-center gap-4 md:gap-6 flex-wrap">
            <Link
              href="#how-it-works"
              className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              איך זה עובד
            </Link>
            <Link
              href="#pricing"
              className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              מחירים
            </Link>
            {user ? (
              <>
                <button
                  onClick={handleGoToDashboard}
                  className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  {user.name || user.email}
                </button>
                <button
                  onClick={handleLogout}
                  className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  התנתקות
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  התחברות
                </Link>
                <Link
                  href="/signup"
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm md:text-base font-medium transition-colors"
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

