import type { Metadata } from "next";
import { Suspense } from "react";
import { UnsubscribeFlow } from "./UnsubscribeFlow";

export const metadata: Metadata = {
  title: "הסרה מרשימת דיוור | Caleno",
  description: "הסרת מספר מרשימת השיווק והשידורים של קלינו.",
};

function UnsubscribeFallback() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-gray-500" dir="rtl">
      טוען…
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<UnsubscribeFallback />}>
      <UnsubscribeFlow />
    </Suspense>
  );
}
