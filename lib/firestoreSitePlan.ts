import { onSnapshot } from "firebase/firestore";
import { siteDoc } from "@/lib/firestoreSiteConfig";
import { normalizeSiteUserPlan } from "@/lib/siteUserPlan";
import type { SiteUserPlan } from "@/types/siteBilling";

type SiteDocSnap = {
  userPlan?: unknown;
  plan?: unknown;
  config?: { userPlan?: unknown };
};

/**
 * Subscribe to `sites/{siteId}` for billing tier (`userPlan` or `config.userPlan` or legacy `plan`).
 */
export function subscribeSiteUserPlan(
  siteId: string,
  onPlan: (plan: SiteUserPlan) => void,
  onError?: (e: unknown) => void
): () => void {
  return onSnapshot(
    siteDoc(siteId),
    (snap) => {
      if (!snap.exists()) {
        onPlan("basic");
        return;
      }
      const d = snap.data() as SiteDocSnap;
      const raw = d.userPlan ?? d.config?.userPlan ?? d.plan;
      onPlan(normalizeSiteUserPlan(raw));
    },
    (err) => {
      console.error("[subscribeSiteUserPlan]", err);
      onError?.(err);
      onPlan("basic");
    }
  );
}
