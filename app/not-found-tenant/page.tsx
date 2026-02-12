import Link from "next/link";

const ROOT_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://caleno.co";

export default function NotFoundTenantPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4" dir="rtl">
      <div className="max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          התת-דומיין לא נמצא
        </h1>
        <p className="text-slate-600 mb-6">
          הדומיין שבו גלשת אינו רשום במערכת. אם יש לך חשבון, היכנס וצור תת-דומיין מהדף חשבון.
        </p>
        <Link
          href={ROOT_URL}
          className="inline-block px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-semibold transition-colors"
        >
          מעבר ל-Caleno
        </Link>
      </div>
    </div>
  );
}
