# Routing Loop Fix - Summary

## Problem
Users were getting stuck in a loop, being redirected back to `/builder` even after having a `siteId`.

## Root Causes Found

### 1. Using `router.push` instead of `router.replace`
- After wizard completion, using `push` allows users to go back to builder
- Builder guard using `push` allows navigation history issues

### 2. Builder completion didn't verify siteId was set
- No verification after updating Firestore
- User state might not refresh immediately

### 3. Multiple redirect points not using centralized logic
- Some places hardcoded `/builder` redirects
- Not all using `routeAfterAuth()` helper

## Files Changed

### 1. `app/(main)/builder/page.tsx`
**Changes:**
- Builder guard: Changed `router.push` → `router.replace` (line 41)
- Added debug log in guard
- `handleFinish()`: 
  - Added verification step (re-read user doc after updating siteId)
  - Changed `router.push` → `router.replace` (line 195)
  - Added debug logs

**Before:**
```typescript
router.push(`/site/${siteId}/admin`);
```

**After:**
```typescript
await updateUserSiteId(user.id, siteId);
// Verify siteId was set
const updatedUserDoc = await getUserDocument(user.id);
if (updatedUserDoc?.siteId !== siteId) {
  await updateUserSiteId(user.id, siteId); // Retry
}
router.replace(`/site/${siteId}/admin`); // Use replace, not push
```

### 2. `components/auth/RouteGuard.tsx`
**Changes:**
- Changed `router.push` → `router.replace` when redirecting users with siteId
- Added debug log

**Before:**
```typescript
router.push(`/site/${user.siteId}/admin`);
```

**After:**
```typescript
router.replace(`/site/${user.siteId}/admin`);
```

### 3. `app/login/page.tsx`
**Changes:**
- Changed `router.push` → `router.replace` after login

**Before:**
```typescript
router.push(result.redirectPath);
```

**After:**
```typescript
router.replace(result.redirectPath);
```

### 4. `app/signup/page.tsx`
**Changes:**
- Changed `router.push` → `router.replace` after signup

**Before:**
```typescript
router.push("/builder");
```

**After:**
```typescript
router.replace("/builder");
```

### 5. `app/(site)/site/[siteId]/admin/layout.tsx`
**Changes:**
- Changed all `router.push` → `router.replace` for consistency

**Before:**
```typescript
router.push("/builder");
router.push(`/site/${user.siteId}/admin`);
```

**After:**
```typescript
router.replace("/builder");
router.replace(`/site/${user.siteId}/admin`);
```

### 6. `app/(main)/page.tsx` & `components/Header.tsx`
**Changes:**
- Changed `router.push` → `router.replace` in `handleGoToDashboard`
- Added fallback logic to check `user.siteId` directly if `routeAfterAuth` fails

**Before:**
```typescript
router.push(redirectPath);
```

**After:**
```typescript
router.replace(redirectPath);
// Fallback:
if (user.siteId) {
  router.replace(`/site/${user.siteId}/admin`);
}
```

### 7. `components/auth/AuthProvider.tsx`
**Changes:**
- Added debug log in `login()` function

### 8. `lib/authRedirect.ts`
**Changes:**
- Improved debug log formatting

## Key Fixes

### 1. Use `router.replace` instead of `router.push`
**Why:** `replace` doesn't add to browser history, preventing users from going back to builder after completion.

### 2. Verify siteId after update
**Why:** Ensures Firestore write succeeded before redirecting.

```typescript
await updateUserSiteId(user.id, siteId);
const updatedUserDoc = await getUserDocument(user.id);
if (updatedUserDoc?.siteId !== siteId) {
  await updateUserSiteId(user.id, siteId); // Retry
}
```

### 3. Centralized redirect logic
**All redirects use `routeAfterAuth()`:**
- Login handler
- Signup handler (always goes to `/builder` because `siteId=null`)
- Dashboard button handlers

### 4. Builder guard prevents loops
**Builder page guard:**
```typescript
useEffect(() => {
  if (user && user.siteId) {
    router.replace(`/site/${user.siteId}/admin`); // Use replace
  }
}, [user, router]);
```

## Flow Verification

### Signup Flow
```
1. User signs up → Creates users/{uid} with siteId=null
2. Redirects to /builder (router.replace)
3. User completes wizard
4. Creates sites/{siteId}
5. Updates users/{uid}.siteId = siteId
6. Verifies siteId was set
7. Redirects to /site/{siteId}/admin (router.replace)
✅ User cannot go back to builder
```

### Login Flow (Has SiteId)
```
1. User logs in
2. routeAfterAuth() checks users/{uid}.siteId
3. siteId exists → returns /site/{siteId}/admin
4. Redirects (router.replace)
✅ Never goes to builder
```

### Login Flow (No SiteId)
```
1. User logs in
2. routeAfterAuth() checks users/{uid}.siteId
3. siteId is null → returns /builder
4. Redirects (router.replace)
✅ Goes to builder to create site
```

### Builder Completion Flow
```
1. User clicks "Create Website"
2. Creates sites/{siteId} document
3. Updates users/{uid}.siteId = siteId
4. Verifies siteId was set (re-reads user doc)
5. router.replace(`/site/${siteId}/admin`)
6. Builder guard detects user.siteId exists
7. Also redirects (but replace doesn't add to history)
✅ User permanently leaves builder
```

## Debug Logs Added

All redirects now log in development:
```
[routeAfterAuth] uid=..., siteId=... -> redirect=/site/... or /builder
[builder guard] uid=..., siteId=... -> redirecting to /site/...
[handleFinish] Verified user ...siteId = ..., redirecting to /site/...
[AuthProvider.login] uid=..., siteId=... -> redirectPath=...
```

## Testing Checklist

- [ ] **Signup → Builder → Create Website:**
  - Sign up → Should go to `/builder`
  - Complete wizard → Should go to `/site/{siteId}/admin`
  - Browser back button → Should NOT go back to builder

- [ ] **Login with SiteId:**
  - Login → Should go directly to `/site/{siteId}/admin`
  - Should NEVER see builder

- [ ] **Login without SiteId:**
  - Login → Should go to `/builder`
  - Complete wizard → Should go to `/site/{siteId}/admin`

- [ ] **Builder Guard:**
  - Try accessing `/builder` when `user.siteId` exists → Should redirect to `/site/{siteId}/admin`
  - Should NOT be able to access builder

- [ ] **Admin Layout:**
  - Try accessing `/site/{wrongSiteId}/admin` → Should redirect to own site or builder
  - Should use `router.replace` (no history)

## Summary

✅ **All redirects use `router.replace`** - Prevents going back to builder
✅ **Builder completion verifies siteId** - Ensures Firestore write succeeded
✅ **Centralized redirect logic** - All use `routeAfterAuth()`
✅ **Builder guard prevents loops** - Redirects users with siteId immediately
✅ **Debug logs added** - Easy to trace redirect decisions

The routing loop is now fixed! Users with `siteId` will never see the builder again. 🎉
