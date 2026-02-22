# Multi-Tenant Isolation Audit Report

**Date:** 2025-02-17  
**Scope:** Firestore queries, fallback tenant logic, localStorage/cookies, tenant resolution, admin/public API ownership checks.

---

## Executive Summary

| Category | Risk Level | Count |
|----------|-----------|-------|
| Critical (no ownership check) | 2 | High |
| High (potential cross-tenant leakage) | 3 | Medium |
| Medium (legacy/cleanup issues) | 4 | Low |

---

## 1. Firestore Queries Without Tenant Filtering

### 1.1 ✅ `app/api/admin/sites/route.ts` – Acceptable
- **Query:** `db.collection("sites").get()` – reads all sites
- **Control:** Platform admin only (`isPlatformAdmin(email)`) – intended for super-admin use
- **Action:** None required

### 1.2 ⚠️ `lib/firestoreUsersServer.ts` – `createWebsiteDocumentServer`
- **Query:** `db.collection("websites").where("subdomain", "==", subdomain)` – no tenant/user filter
- **Context:** Used to check if subdomain is taken before creating a new website. Reads across all tenants.
- **Risk:** Low – only checks existence; no sensitive data leakage. Subdomain uniqueness is global by design.
- **Action:** Document as intentional. Consider adding a composite index if needed for performance.

### 1.3 ⚠️ `lib/whatsapp/runReminders.ts` and `lib/whatsapp/findBookingsAwaitingConfirmation.ts`
- **Query:** `collectionGroup("bookings")` with `customerPhoneE164`, `whatsappStatus`, `startAt` – queries across all tenants
- **Context:** Intentional for WhatsApp reminder/confirmation flows. `siteId` is derived from document path.
- **Risk:** Acceptable – by design for cross-tenant lookups by phone.
- **Action:** None required; document as intentional.

### 1.4 ⚠️ `lib/firestoreServices.ts` – Legacy Per-User Path
- **Path:** `users/{userId}/site/main/services` – per-user, not per-site
- **Risk:** Potential conflict with `sites/{siteId}/...` model. If both are used, tenant isolation could be unclear.
- **Action:** Audit usage. Prefer migrating to `sites/{siteId}/...` for consistency. `firestoreSiteServices` imports this – verify migration status.

---

## 2. Fallback Tenant / Subdomain Logic

### 2.1 ✅ No Dangerous Fallbacks Found
- No `defaultTenant`, `limit(1)` on sites, or hardcoded subdomain fallbacks were found.
- `getTenantForUid` uses `users/{uid}` + ownership validation; no fallback to “first site”.

### 2.2 ⚠️ `lib/initializeUserSite.ts` – Hardcoded Template
- **Code:** `TEMPLATE_SITE_ID = "amitay-hair-mk6krumy"`
- **Context:** Copies template site data to `users/{uid}/site/main` for new users.
- **Risk:** Low – only used during onboarding; does not affect tenant resolution.
- **Action:** Consider making template configurable via env var.

---

## 3. localStorage / sessionStorage – Tenant Persistence

### 3.1 ✅ `lib/clearStaleRedirectStorage.ts`
- Clears `returnTo`, `redirectTo`, `tenant`, `tenantSlug`, `slug`, `siteId`, `currentSite`, `currentTenant` on login/logout.
- Prevents cross-tenant redirects.

### 3.2 ⚠️ `app/(site)/site/[siteId]/admin/settings/page.tsx` – Delete Account Storage Cleanup Bug
- **Lines 1714–1715:** Keys checked as `siteConfig:${firebaseUser.uid}` and `bookingState:${firebaseUser.uid}`.
- **Actual keys:** `siteConfig:${siteId}` and `bookingState:${siteId}` (siteId ≠ uid).
- **Impact:** On account deletion, site-specific storage is NOT cleared. Stale `siteConfig`/`bookingState` may persist for the next user on the same device.
- **Fix:** Use `siteId` (or iterate over all `siteConfig:*` and `bookingState:*` keys) when clearing storage on delete.

### 3.3 ⚠️ `app/(main)/preview/page.tsx`
- **Storage:** `sessionStorage.getItem("latestSiteConfig")` – not keyed by siteId.
- **Context:** Wizard → preview flow; single session.
- **Risk:** Low – sessionStorage is per-tab; `latestSiteConfig` is session-scoped. Risk increases if user switches accounts in same tab.
- **Action:** Clear `latestSiteConfig` on logout (add to `clearStaleRedirectStorage` or logout handler).

### 3.4 ✅ Other Storage
- `siteConfig:${siteId}`, `bookingState:${siteId}`, `aiChat:${siteId}` – correctly scoped by siteId.
- `lib/booking.ts` – deprecated `bookings:${siteId}` – tenant-scoped.

---

## 4. API Routes – Missing Ownership Verification

### 4.1 ✅ FIXED: `app/api/admin-ai/route.ts`
- **Was:** Accepts `siteId` from request body with no authentication or ownership check.
- **Fix applied:** `requireAuth` + `assertSiteOwner(uid, siteId)` before any operations. `AIFloatingWidget` now passes `Authorization: Bearer <token>`.

### 4.2 ✅ FIXED: `app/api/whatsapp/send-booking-confirmation/route.ts`
- **Was:** Accepts `siteId` and `bookingId` from body with no authentication.
- **Fix applied:** Requires Firebase ID token; loads booking, validates siteId; `assertSiteOwner`; rate limit 1 per (siteId, bookingId) per 10 min. Public booking flow uses `POST /api/bookings/confirm-after-create` (no auth, strict validation: createdAt within 5 min, rate limit).

### 4.3 ✅ Routes with Proper Ownership Check (verified)
- `clients/update`, `bookings/archive-all-by-client`, `import/execute`, `cloudinary/sign`, `settings/client-types/delete`, `clients/delete`, `clients/delete-bulk`, `delete-archived-bookings`, `archive-cascade`, `bookings/delete-booking-group`, `admin/ensure-daily-cleanup`, `admin/run-booking-cleanup`, `admin/dev-reset-site`, `admin/dev-reset-bookings`, `admin/site-logo`, `repair-site-ownership`, `dedupe-archived-bookings`, `import/dry-run`, `sites/[siteId]/custom-domain/*` – all validate `ownerUid === uid` (or platform admin where applicable).

### 4.4 Cron / Debug Routes
- `cron/test-whatsapp-reminder`, `cron/debug-reminder` – protected by `CRON_SECRET`. Acceptable for internal use.

---

## 5. Tenant Resolution and Verification

### 5.1 ✅ Server-Side Tenant Resolution
- `/api/tenants/me` – uses `getTenantForUid(decoded.uid)`; tenant from verified token, not client.
- `/api/dashboard-redirect` – same pattern.
- `getTenantForUid` – reads `users/{uid}`, validates `sites/{siteId}.ownerUid === uid`.

### 5.2 ✅ Firestore Rules
- `sites/{siteId}` and subcollections – read/write gated by `ownerUid` / `ownerUserId`.
- `tenants/{slug}` – create/update/delete restricted to owner.
- `users/{userId}` – only owner can read/write.

---

## 6. Risky Files and Proposed Fixes

| File | Issue | Status |
|------|-------|--------|
| `app/api/admin-ai/route.ts` | No auth/ownership check | ✅ Fixed: `requireAuth` + `assertSiteOwner` |
| `app/api/whatsapp/send-booking-confirmation/route.ts` | No auth; open endpoint | ✅ Fixed: require auth; public flow uses `/api/bookings/confirm-after-create` |
| `app/(site)/site/[siteId]/admin/settings/page.tsx` | Delete-account storage cleanup uses `uid` instead of `siteId` | Clear `siteConfig:*` and `bookingState:*` (all keys) or use `siteId` from context |
| `lib/clearStaleRedirectStorage.ts` | `latestSiteConfig` not cleared | Add `latestSiteConfig` to `STALE_KEYS` |
| `app/(main)/preview/page.tsx` | `latestSiteConfig` in sessionStorage | Ensure cleared on logout (via `clearStaleRedirectStorage`) |
| `lib/firestoreServices.ts` | Legacy `users/{uid}/site` path | Document or migrate to `sites/{siteId}`; audit `firestoreSiteServices` usage |
| `lib/initializeUserSite.ts` | Hardcoded `TEMPLATE_SITE_ID` | Make configurable via `TEMPLATE_SITE_ID` env var (optional) |

---

## 7. Recommended Implementation Order

1. **Immediate:** Add auth + ownership check to `app/api/admin-ai/route.ts`.
2. **Immediate:** Protect `send-booking-confirmation` (token or rate-limit + validation).
3. **Short-term:** Fix delete-account storage cleanup in `settings/page.tsx`.
4. **Short-term:** Add `latestSiteConfig` to `clearStaleRedirectStorage`.
5. **Medium-term:** Audit and migrate `firestoreServices` to site-based model if still in use.
