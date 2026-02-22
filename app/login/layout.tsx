import type { Metadata } from "next";
import { headers } from "next/headers";
import { isTenantSubdomainHost } from "@/lib/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") ?? headersList.get("x-forwarded-host") ?? "";
  const isTenant = isTenantSubdomainHost(host);
  const title = isTenant ? "אימות זהות | Caleno" : "התחברות לחשבון | Caleno";
  return { title };
}

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
