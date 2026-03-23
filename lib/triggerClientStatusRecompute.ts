/**
 * Ensures default rules are persisted and every client gets `currentStatus` without requiring
 * "Save" on the status settings form. Runs at most once per browser tab session per site.
 */
const STORAGE_KEY_PREFIX = "caleno_client_status_recompute_v1";

export async function triggerClientStatusRecomputeOncePerSession(
  siteId: string,
  getToken: () => Promise<string | undefined>
): Promise<void> {
  if (typeof window === "undefined" || !siteId) return;
  const key = `${STORAGE_KEY_PREFIX}:${siteId}`;
  if (sessionStorage.getItem(key) === "1") return;

  const token = await getToken();
  if (!token) return;

  sessionStorage.setItem(key, "1");
  try {
    const res = await fetch("/api/settings/client-status/recompute", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ siteId }),
    });
    if (!res.ok) {
      sessionStorage.removeItem(key);
    }
  } catch {
    sessionStorage.removeItem(key);
  }
}
