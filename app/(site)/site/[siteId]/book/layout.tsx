import type { Metadata } from "next";
import { buildBookingPageMetadata } from "@/lib/bookingPageMetadata";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
};

export async function generateMetadata({ params }: Pick<LayoutProps, "params">): Promise<Metadata> {
  const { siteId } = await params;
  const headersList = await headers();
  return buildBookingPageMetadata(siteId, headersList);
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
