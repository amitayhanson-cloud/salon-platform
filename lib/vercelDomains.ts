/**
 * Vercel REST API for domain management. Server-only.
 * Requires VERCEL_TOKEN and VERCEL_PROJECT_ID_OR_NAME.
 */

const VERCEL_API_BASE = "https://api.vercel.com";

function getConfig(): { token: string; projectId: string } | null {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID_OR_NAME?.trim();
  if (!token || !projectId) return null;
  return { token, projectId };
}

async function vercelFetch(
  path: string,
  options: { method?: string; headers?: HeadersInit; body?: object | BodyInit | null; signal?: AbortSignal } = {}
): Promise<Response> {
  const config = getConfig();
  if (!config) {
    return new Response(
      JSON.stringify({ error: "Vercel API not configured (VERCEL_TOKEN / VERCEL_PROJECT_ID_OR_NAME)" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
  const { token, projectId } = config;
  const url = path.startsWith("http") ? path : `${VERCEL_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const bodyPayload =
    options.body != null && typeof options.body === "object" && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : (options.body as BodyInit | undefined);
  const res = await fetch(url, {
    method: options.method,
    headers,
    body: bodyPayload,
    ...(options.signal && { signal: options.signal }),
  });
  return res;
}

/** Add domain to project. POST /v10/projects/{id}/domains */
export async function vercelAddDomain(domain: string): Promise<{
  ok: true;
  verified?: boolean;
  verification?: Array< { type: string; domain: string; value: string } >;
} | { ok: false; status: number; error: string }> {
  const config = getConfig();
  if (!config) return { ok: false, status: 502, error: "Vercel API not configured" };
  const res = await vercelFetch(
    `/v10/projects/${encodeURIComponent(config.projectId)}/domains`,
    { method: "POST", body: { name: domain } }
  );
  const data = await res.json().catch(() => ({})) as { verified?: boolean; verification?: Array<{ type: string; domain: string; value: string }>; error?: { message?: string } };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: (data as { error?: { message?: string } }).error?.message ?? res.statusText,
    };
  }
  return { ok: true, verified: data.verified, verification: data.verification };
}

/** Verify project domain. POST /v10/projects/{id}/domains/{domain}/verify */
export async function vercelVerifyDomain(domain: string): Promise<{
  ok: true;
  verified?: boolean;
} | { ok: false; status: number; error: string }> {
  const config = getConfig();
  if (!config) return { ok: false, status: 502, error: "Vercel API not configured" };
  const res = await vercelFetch(
    `/v10/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(domain)}/verify`,
    { method: "POST" }
  );
  const data = await res.json().catch(() => ({})) as { verified?: boolean; error?: { message?: string } };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data.error?.message ?? res.statusText,
    };
  }
  return { ok: true, verified: data.verified };
}

/** Get domain configuration (DNS instructions, misconfigured). GET /v6/domains/{domain}/config */
export async function vercelGetDomainConfig(domain: string): Promise<{
  ok: true;
  misconfigured: boolean;
  configuredBy: string | null;
  recommendedCNAME?: Array<{ rank: number; value: string }>;
  recommendedIPv4?: Array<{ rank: number; value: string[] }>;
  acceptedChallenges?: string[];
} | { ok: false; status: number; error: string }> {
  const config = getConfig();
  if (!config) return { ok: false, status: 502, error: "Vercel API not configured" };
  const res = await vercelFetch(
    `/v6/domains/${encodeURIComponent(domain)}/config?projectIdOrName=${encodeURIComponent(config.projectId)}`
  );
  const data = await res.json().catch(() => ({})) as {
    misconfigured?: boolean;
    configuredBy?: string | null;
    recommendedCNAME?: Array<{ rank: number; value: string }>;
    recommendedIPv4?: Array<{ rank: number; value: string[] }>;
    acceptedChallenges?: string[];
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: data.error?.message ?? res.statusText,
    };
  }
  return {
    ok: true,
    misconfigured: data.misconfigured ?? true,
    configuredBy: data.configuredBy ?? null,
    recommendedCNAME: data.recommendedCNAME,
    recommendedIPv4: data.recommendedIPv4,
    acceptedChallenges: data.acceptedChallenges,
  };
}

/** Remove domain from project. DELETE /v10/projects/{id}/domains/{domain} */
export async function vercelRemoveDomain(domain: string): Promise<{
  ok: true;
} | { ok: false; status: number; error: string }> {
  const config = getConfig();
  if (!config) return { ok: false, status: 502, error: "Vercel API not configured" };
  const res = await vercelFetch(
    `/v10/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(domain)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return {
      ok: false,
      status: res.status,
      error: data.error?.message ?? res.statusText,
    };
  }
  return { ok: true };
}

/** Normalize Vercel config to UI-friendly DNS records for the domain. */
export function buildRecordsToAdd(config: {
  recommendedCNAME?: Array<{ rank: number; value: string }>;
  recommendedIPv4?: Array<{ rank: number; value: string[] }>;
}, domain: string): { type: string; name: string; value: string }[] {
  const records: { type: string; name: string; value: string }[] = [];
  if (config.recommendedIPv4?.length) {
    const ip = config.recommendedIPv4[0];
    const val = Array.isArray(ip?.value) ? ip.value[0] : ip?.value;
    if (val) records.push({ type: "A", name: "@", value: val });
  }
  if (config.recommendedCNAME?.length) {
    const cname = config.recommendedCNAME[0];
    if (cname?.value) records.push({ type: "CNAME", name: "www", value: cname.value });
  }
  return records;
}
