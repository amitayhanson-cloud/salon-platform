# Tenant Storage & Isolation Fixes

## Summary of Changes

Implements the remaining fixes from MULTI_TENANT_ISOLATION_AUDIT.md to prevent stale tenant data, routing confusion, and cross-tenant state bleed.

---

## 1. Settings Page – Delete Account Cleanup (HIGH-RISK FIX)

**File:** `app/(site)/site/[siteId]/admin/settings/page.tsx`

**Bug:** Cleanup used `siteConfig:${firebaseUser.uid}` and `bookingState:${firebaseUser.uid}` but real keys are `siteConfig:${siteId}` and `bookingState:${siteId}`.

**Fix:** Replaced manual key iteration with `clearStaleStorageOnLogout()` from the centralized utility. This clears:
- All keys starting with `siteConfig:`, `bookingState:`, `latestSiteConfig:`, `salonBookingState:`
- Auth redirect keys (`returnTo`, `tenant`, `slug`, etc.)

**Prevents:** Stale tenant state persisting after account deletion; next user on same device loading wrong site data.

---

## 2. firestoreServices.ts – Legacy Path (HIGH-RISK FIX)

**File:** `lib/firestoreServices.ts`

**Risk:** Uses `users/{userId}/site/main/services` while the canonical model is `sites/{siteId}.services`.

**Fix:**
- Added deprecation notice; module only used for one-time migration.
- Updated `migrateServicesFromSubcollection` in `lib/firestoreSiteServices.ts` to use `ownerUid` from the site doc instead of passing `siteId` to `getServices()`.
- Migration now reads from `users/{ownerUid}/site/main/services` when the site’s services array is missing.

**Prevents:** Tenant isolation issues and incorrect reads from legacy paths.

---

## 3. Preview Page – latestSiteConfig (LOW-RISK FIX)

**File:** `app/(main)/preview/page.tsx`

**Risk:** `sessionStorage.getItem("latestSiteConfig")` was unkeyed; `localStorage.getItem("salonBookingState")` was unkeyed.

**Fix:**
- `latestSiteConfig`: reads from `latestSiteConfig:${siteId}` when `?siteId=` is present, otherwise `latestSiteConfig` (wizard flow).
- `salonBookingState`: uses `salonBookingState:${siteId}` or `salonBookingState:preview` when no siteId.
- `HairLuxuryPreview` accepts `storageKey` and uses it for booking state.

**Prevents:** Tenant bleed when switching accounts or sites in the same tab.

---

## 4. Central Storage Cleanup Utility

**File:** `lib/client/storageCleanup.ts` (new)

**Functions:**
- `clearTenantStorage(siteId?)`: Clears storage for a given site; also clears unkeyed legacy keys.
- `clearAllTenantStorage()`: Removes all keys starting with `siteConfig:`, `bookingState:`, `latestSiteConfig:`, `salonBookingState:`.
- `clearAuthRedirectState()`: Clears redirect keys (`returnTo`, `tenant`, `slug`, etc.).
- `clearStaleStorageOnLogout()`: Calls `clearAllTenantStorage()` and `clearAuthRedirectState()`.

**Usage:** On logout, account deletion, and auth user change.

---

## 5. clearStaleRedirectStorage Integration

**File:** `lib/clearStaleRedirectStorage.ts`

**Change:** Delegates to `clearAuthRedirectState()` and `clearAllTenantStorage()` from `storageCleanup.ts`.

**When called:** `AuthProvider`’s `onAuthStateChanged` when `firebaseUser` becomes null (logout).

---

## 6. Firestore Migration Fix

**File:** `lib/firestoreSiteServices.ts`

**Change:** `migrateServicesFromSubcollection` now loads `ownerUid` from the site doc and calls `getServices(ownerUid)` instead of `getServices(siteId)`.

---

## Verification

### No remaining references to:
- `siteConfig:${uid}` – removed; all use `siteConfig:${siteId}`
- `bookingState:${uid}` – removed; all use `bookingState:${siteId}`
- `sessionStorage latestSiteConfig` without siteId – kept only for wizard flow; cleared on logout
- `users/{userId}/site/main/services` – deprecated; only used for migration with correct `ownerUid`

### React Query / SWR

Not used in this codebase; no cache changes needed.
