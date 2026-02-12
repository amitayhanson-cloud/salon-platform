import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  params: Promise<{ tenant: string }>;
};

export default async function TenantSiteLayout({ children, params }: Props) {
  const { tenant } = await params;
  return (
    <div data-tenant={tenant} className="min-h-screen bg-slate-50">
      {children}
    </div>
  );
}
