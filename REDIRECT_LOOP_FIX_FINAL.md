# Redirect Loop Fix - Final Summary

## Problem
Infinite redirect loop: `/builder` ↔ `/site/[siteId]/admin`

## Root Cause
**Admin layout was redirecting to `/builder` when site doesn't exist, even if `user.siteId` exists:**
1. User has `siteId = "abc123"`
2. User goes to `/site/abc123/admin`
3. Admin checks: `user.siteId === route.siteId` ✅
4. Admin checks Firestore: site doesn't exist ❌
5. Admin redirects to `/builder` ❌ (WRONG - user.siteId still exists!)
6. Builder sees `user.siteId` exists → redirects to `/site/abc123/admin`
7. Loop continues...

## Solution
**Rule: If `user.siteId` exists, NEVER redirect to `/builder`**

Instead:
- Show error page if site doesn't exist
- Or redirect to user's own site if `user.siteId !== route.siteId`

## Files Changed

### 1. `app/(main)/builder/page.tsx`
**Removed:**
- ❌ `RouteGuard` component (redundant, caused duplicate redirects)

**Fixed:**
- ✅ Uses `authReady` check before redirect
- ✅ Uses `didRedirect` ref to prevent multiple redirects
- ✅ Only redirects if `user.siteId` exists
- ✅ Shows loading state while redirecting

**Logic:**
```typescript
if (!authReady) return; // Wait for auth
if (!user) → /login
if (user.siteId) → /site/{siteId}/admin (ONCE)
else → allow builder
```

### 2. `app/(site)/site/[siteId]/admin/layout.tsx`
**Fixed:**
- ✅ Checks `user.siteId` FIRST (single source of truth)
- ✅ If `user.siteId` is null → redirect to `/builder` (ONCE)
- ✅ If `user.siteId !== route.siteId` → redirect to own site (ONCE)
- ✅ If site doesn't exist → show error page (NOT redirect to builder)
- ✅ Uses `redirectAttempted` ref to prevent loops

**Critical Fix:**
```typescript
// OLD (WRONG):
if (!siteSnap.exists()) {
  router.replace("/builder"); // ❌ Creates loop if user.siteId exists
}

// NEW (CORRECT):
if (!siteSnap.exists()) {
  // Show error page instead of redirecting
  setAuthorized(false);
  return; // Show error UI
}
```

### 3. `hooks/useAuthState.ts` (NEW)
**Created:** Shared hook for auth state (can be used by guards if needed)

## Redirect Rules (Single Source of Truth)

### Builder Page (`/builder`)
- ✅ `user.siteId` exists → `/site/{siteId}/admin`
- ✅ `user.siteId` is null → allow builder
- ✅ Not logged in → `/login`

### Admin Page (`/site/[siteId]/admin`)
- ✅ `user.siteId` is null → `/builder`
- ✅ `user.siteId !== route.siteId` → `/site/{user.siteId}/admin`
- ✅ `user.siteId === route.siteId` → verify Firestore ownership
- ✅ Site doesn't exist → show error page (NOT redirect to builder)

## Debug Logs

All logs are dev-only:
- `[BUILDER GUARD]` - Builder redirect decisions
- `[ADMIN GUARD]` - Admin redirect decisions

Example:
```
[BUILDER GUARD] authReady=true, uid=..., siteId=..., action=redirect to /site/.../admin
[ADMIN GUARD] authReady=true, uid=..., userSiteId=..., routeSiteId=..., action=allow access
```

## Testing

- [ ] **Open `/builder` with `user.siteId` exists:**
  - Should redirect to `/site/{siteId}/admin` ONCE
  - No loop back to builder

- [ ] **Open `/site/{siteId}/admin` with matching `siteId`:**
  - Should load admin panel
  - No redirect to builder

- [ ] **Open `/site/{wrongSiteId}/admin`:**
  - Should redirect to `/site/{user.siteId}/admin` ONCE
  - No loop

- [ ] **Open `/site/{siteId}/admin` with `user.siteId=null`:**
  - Should redirect to `/builder` ONCE
  - No loop

- [ ] **Open `/site/{siteId}/admin` where site doesn't exist:**
  - Should show error page
  - Should NOT redirect to builder (prevents loop)

## Summary

✅ **Removed RouteGuard from builder** - Eliminated duplicate redirect logic
✅ **Fixed builder guard** - Uses `authReady`, prevents multiple redirects  
✅ **Fixed admin guard** - Checks `user.siteId` first, shows error instead of redirecting to builder
✅ **Prevented loops** - Both guards use ref flags, admin never redirects to builder if `user.siteId` exists
✅ **Debug logs added** - Easy to trace redirect decisions

**Key Fix:** Admin layout now shows error page instead of redirecting to builder when site doesn't exist. This prevents the loop because builder would redirect back if `user.siteId` still exists.

The redirect loop is now fixed! 🎉
