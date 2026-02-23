import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { isPlatformHost } from "@/lib/tenant";

const ROOT_METADATA: Metadata = {
  title: "Caleno | מערכת ניהול מתקדמת לעסקים – זימון תורים ובניית אתרים",
  description:
    "פלטפורמה אחת לניהול העסק שלך: אתר מקצועי, מערכת זימון תורים, ניהול לקוחות ותזכורות אוטומטיות. מתאים לעסקים קטנים.",
};

const DEFAULT_METADATA: Metadata = {
  title: "Caleno - בונים אתר מושלם לסלון שלך בדקות",
  description:
    "בונים אתר מקצועי לסלון שלך ללא צורך בידע טכני. מתאים לספריות, מכוני יופי וספא.",
};

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isRoot = isPlatformHost(host);

  return {
    ...(isRoot ? ROOT_METADATA : DEFAULT_METADATA),
    icons: {
      icon: "/favicon.ico",
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen w-full overflow-x-hidden overscroll-none bg-white text-slate-900 antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
