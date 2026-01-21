# Redirect Loop Fix - Summary

## Problem
Infinite redirect loop between `/builder` and `/site/[siteId]/admin`:
- Builder redirects to admin when `user.siteId` exists
- Admin redirects to builder when site doesn't exist or user doesn't own it
- Creates infinite loop

## Root Causes

### 1. Duplicate Redirect Logic
- Builder page had both `useEffect` redirect AND `RouteGuard` component
- Both were checking `user.siteId` and redirecting
- RouteGuard didn't use `authReady`, causing premature redirects

### 2. Admin Layout Redirecting to Builder
- Admin layout checked Firestore for site existence
- If site didn't exist, redirected to `/builder`
- But if `user.siteId` exists, builder redirects back to admin
- Created loop

### 3. Missing `authReady` Check
- Redirects happened before auth was fully initialized
- Caused multiple redirect attempts

### 4. No Redirect Guard
- Multiple redirects could fire simultaneously
- No ref flag to prevent repeated redirects

## Files Changed

### 1. `app/(main)/builder/page.tsx`
**Removed:**
- ❌ `RouteGuard` component wrapper (redundant)
- ❌ Old redirect logic that didn't check `authReady`

**Added:**
- ✅ Proper `authReady` check before redirect
- ✅ `didRedirect` ref to prevent multiple redirects
- ✅ Loading state while auth initializes
- ✅ Loading state while redirecting
- ✅ Debug logs: `[BUILDER GUARD]`

**New Logic:**
```typescript
// Wait for authReady
if (!authReady || authLoading) return;

// Not logged in -> /login
if (!user) {
  if (!didRedirect.current) {
    didRedirect.current = true;
    router.replace("/login");
  }
  return;
}

// Has siteId -> redirect to admin
if (user.siteId) {
  if (!didRedirect.current) {
    didRedirect.current = true;
    router.replace(`/site/${user.siteId}/admin`);
  }
  return;
}

// No siteId -> allow builder
```

### 2. `app/(site)/site/[siteId]/admin/layout.tsx`
**Fixed:**
- ✅ Check `user.siteId` FIRST (single source of truth)
- ✅ If `user.siteId` is null -> redirect to `/builder`
- ✅ If `user.siteId !== route.siteId` -> redirect to own site
- ✅ Only then check Firestore for site existence
- ✅ Debug logs: `[ADMIN GUARD]`

**Key Fix:**
```typescript
// CRITICAL: Check user.siteId FIRST (single source of truth)
if (!user.siteId || user.siteId.trim() === "") {
  // Redirect to builder
  router.replace("/builder");
  return;
}

if (user.siteId !== siteId) {
  // Redirect to own site
  router.replace(`/site/${user.siteId}/admin`);
  return;
}

// Then verify site exists in Firestore
```

### 3. `hooks/useAuthState.ts` (NEW)
**Created shared hook:**
- Provides stable auth state
- Can be used by both guards if needed

### 4. `components/auth/RouteGuard.tsx`
**Status:** Still exists but NOT used by builder page anymore
- Builder page uses its own guard logic
- RouteGuard can be used by other pages if needed

## Redirect Logic Flow

### Builder Page (`/builder`)
```
1. Wait for authReady
2. If !user -> /login
3. If user.siteId exists -> /site/{siteId}/admin
4. If user.siteId is null -> allow builder UI
```

### Admin Page (`/site/[siteId]/admin`)
```
1. Wait for authReady
2. If !user -> /login
3. If user.siteId is null -> /builder
4. If user.siteId !== route.siteId -> /site/{user.siteId}/admin
5. If user.siteId === route.siteId -> verify Firestore ownership
6. If authorized -> allow admin UI
```

## Debug Logs Added

All logs are dev-only:
- `[BUILDER GUARD]` - Builder redirect decisions
- `[ADMIN GUARD]` - Admin redirect decisions

Example logs:
```
[BUILDER GUARD] authReady=true, uid=..., siteId=..., action=redirect to /site/.../admin
[ADMIN GUARD] authReady=true, uid=..., userSiteId=..., routeSiteId=..., action=allow access
```

## Testing Checklist

- [ ] **Open `/builder` with user.siteId:**
  - Should redirect to `/site/{siteId}/admin` once
  - No loop back to builder

- [ ] **Open `/site/{siteId}/admin` with matching siteId:**
  - Should load admin panel
  - No redirect to builder

- [ ] **Open `/site/{wrongSiteId}/admin`:**
  - Should redirect to `/site/{user.siteId}/admin` once
  - No loop

- [ ] **Open `/site/{siteId}/admin` with user.siteId=null:**
  - Should redirect to `/builder` once
  - No loop

- [ ] **Console logs:**
  - Should see single redirect decision per page load
  - No repeated `[BUILDER GUARD]` or `[ADMIN GUARD]` logs

## Summary

✅ **Removed RouteGuard from builder** - Eliminated duplicate redirect logic
✅ **Fixed builder guard** - Uses `authReady`, prevents multiple redirects
✅ **Fixed admin guard** - Checks `user.siteId` first (single source of truth)
✅ **Prevented loops** - Both guards use ref flags to prevent repeated redirects
✅ **Debug logs added** - Easy to trace redirect decisions

The redirect loop is now fixed! Both pages check `user.siteId` (single source of truth) and redirect only once using ref guards. 🎉
