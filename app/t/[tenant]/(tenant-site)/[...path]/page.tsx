import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenant-data";

type Props = {
  params: Promise<{ tenant: string; path: string[] }>;
};

export default async function TenantCatchAllPage({ params }: Props) {
  const { tenant, path } = await params;
  const tenantData = await getTenantBySlug(tenant);
  if (!tenantData) {
    notFound();
  }
  const pathStr = path.length > 0 ? `/${path.join("/")}` : "/";
  return (
    <main className="container mx-auto px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          Tenant: {tenantData.slug}
        </h1>
        <p className="mt-2 text-slate-600">Page at {tenantData.slug}.caleno.co</p>
        <p className="mt-1 text-sm text-slate-500">Path: {pathStr}</p>
      </div>
    </main>
  );
}
