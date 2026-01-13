"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/");
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
                <Link
                  href="/account"
                  className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  {user.name}
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
                >
                  התנתקות
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-sm md:text-base text-neutral-600 hover:text-neutral-900 transition-colors"
              >
                התחברות
              </Link>
            )}
          </div>
        </div>
      </nav>
    </header>
  );
}

