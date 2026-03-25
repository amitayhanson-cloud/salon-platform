/**
 * Billing / product tier stored on `sites/{siteId}.userPlan` (or legacy aliases).
 * Default when missing: basic (teaser analytics).
 */
export type SiteUserPlan = "basic" | "premium";
