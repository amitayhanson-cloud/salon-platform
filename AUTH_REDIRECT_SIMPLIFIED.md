# Simplified Auth Redirect Logic - Implementation Summary

## Problem
- Users with completed setup were still being sent to wizard
- Complex logic with `websites` collection and `setupStatus`
- Site was created at signup instead of after wizard completion

## Solution
Simplified to use `users/{uid}.siteId` as the **single source of truth**:
- `siteId` exists → go to `/site/[siteId]`
- `siteId` is null/empty → go to `/builder` (wizard)

## Files Changed

### 1. `lib/authRedirect.ts` (SIMPLIFIED)
**Replaced complex logic with simple siteId check:**

```typescript
export async function routeAfterAuth(userId: string): Promise<string> {
  // Get user document (O(1))
  const userDoc = await getUserDocument(userId);
  
  // Create user doc if missing (with siteId=null)
  if (!userDoc) {
    await createUserDocument(userId, "", "");
    return "/builder";
  }

  const siteId = userDoc?.siteId;
  
  // Debug log
  console.log(`[routeAfterAuth] uid=${userId}, siteId=${siteId || "null"} -> redirect=${siteId ? `/site/${siteId}/admin` : "/builder"}`);

  // If siteId exists → go to site
  if (siteId && siteId.trim() !== "") {
    return `/site/${siteId}/admin`;
  }

  // No siteId → go to wizard
  return "/builder";
}

export async function updateUserSiteId(userId: string, siteId: string): Promise<void> {
  // Updates users/{uid}.siteId after wizard completion
}
```

**Key Changes:**
- ✅ Removed `websites` collection references
- ✅ Removed `setupStatus` checks
- ✅ Single source of truth: `user.siteId`
- ✅ O(1) lookup via `users/{uid}.siteId`

### 2. `types/user.ts`
**Updated User type:**
```typescript
export type User = {
  id: string;
  email: string;
  name?: string;
  siteId: string | null; // null = no site yet, needs wizard
  createdAt: Date;
  updatedAt?: Date;
};
```

**Removed:**
- ❌ `websiteId` field
- ❌ `Website` type references

### 3. `lib/firestoreUsers.ts`
**Updated:**
- `createUserDocument()` - Sets `siteId: null` (no site at signup)
- `getUserDocument()` - Returns `siteId` field (defaults to `null`)

**Removed:**
- ❌ `createWebsiteDocument()` calls
- ❌ `updateUserWebsiteId()` calls
- ❌ `getWebsiteById()` calls
- ❌ `getWebsiteByOwnerId()` calls

### 4. `components/auth/AuthProvider.tsx`
**Simplified:**
- Removed `website` state
- `login()` uses `routeAfterAuth()` helper
- `signup()` creates user with `siteId=null`
- Removed all `websites` collection queries

**Before:**
```typescript
const websiteState = await getUserWebsiteState(userId);
const redirectPath = getRedirectPathAfterAuth(websiteState);
```

**After:**
```typescript
const redirectPath = await routeAfterAuth(userId);
```

### 5. `app/signup/page.tsx`
**Simplified:**
- Removed `/api/create-website` call
- Redirects directly to `/builder` after signup

**Before:**
```typescript
const response = await fetch("/api/create-website", {...});
router.push(`/builder?websiteId=${data.websiteId}`);
```

**After:**
```typescript
router.push("/builder"); // No siteId yet
```

### 6. `app/(main)/builder/page.tsx` (Wizard)
**Major changes:**
- Removed `websiteId` query param usage
- Removed `completeWebsiteSetup()` call
- `handleFinish()` now:
  1. Creates new `sites/{siteId}` document (auto-generated ID)
  2. Saves site config
  3. Updates `users/{uid}.siteId = newSiteId`
  4. Redirects to `/site/{siteId}/admin`

**Before:**
```typescript
const siteId = websiteId || website?.id || createSiteIdFromName(config.salonName);
await completeWebsiteSetup(finalWebsiteId);
```

**After:**
```typescript
const newSiteRef = doc(collection(db, "sites"));
const siteId = newSiteRef.id;
await setDoc(doc(db, "sites", siteId), {
  ownerUserId: user.id,
  siteId,
  createdAt: Timestamp.now(),
  ...
});
await updateUserSiteId(user.id, siteId);
```

### 7. `app/(site)/site/[siteId]/admin/layout.tsx`
**Simplified:**
- Checks `user.siteId === siteId` (ownership)
- Verifies site exists and `ownerUserId` matches
- Removed `setupStatus` checks

**Before:**
```typescript
if (websiteDoc.setupStatus !== "completed") {
  router.push(`/builder?websiteId=${siteId}`);
}
```

**After:**
```typescript
if (user.siteId !== siteId) {
  router.push(`/site/${user.siteId}/admin`);
}
```

### 8. `components/auth/RouteGuard.tsx`
**Simplified:**
- `requireNoSite` - Redirects to dashboard if user has `siteId`
- Removed `setupStatus` checks
- Removed `websites` collection queries

**Before:**
```typescript
requireSetupNotCompleted={true}
if (websiteData?.setupStatus === "completed") {
  router.push(`/site/${user.websiteId}/admin`);
}
```

**After:**
```typescript
requireNoSite={true}
if (user.siteId) {
  router.push(`/site/${user.siteId}/admin`);
}
```

### 9. `app/(main)/page.tsx` & `components/Header.tsx`
**Updated:**
- Use `routeAfterAuth()` helper
- Removed `redirectAfterAuth()` calls

## Flow Diagrams

### Signup Flow
```
1. User clicks "הרשמה" → /signup
2. createUserWithEmailAndPassword() → Creates Firebase Auth user
3. createUserDocument() → Creates users/{uid} with siteId=null
4. Redirect → /builder ✅ (NO siteId yet)
5. User completes wizard
6. handleFinish():
   - Creates sites/{siteId} document (auto-generated ID)
   - Updates users/{uid}.siteId = siteId
7. Redirect → /site/{siteId}/admin ✅
```

### Login Flow (Has SiteId)
```
1. User clicks "התחברות" → /login
2. signInWithEmailAndPassword() → Authenticates
3. getUserDocument() → Reads users/{uid}.siteId
4. Check: siteId exists and not empty
5. Redirect → /site/{siteId}/admin ✅ (SKIPS WIZARD)
```

### Login Flow (No SiteId)
```
1. User clicks "התחברות" → /login
2. signInWithEmailAndPassword() → Authenticates
3. getUserDocument() → Reads users/{uid}.siteId
4. Check: siteId is null/empty
5. Redirect → /builder ✅ (GO TO WIZARD)
```

## Data Model

### `users/{uid}`
```typescript
{
  id: string;
  email: string;
  name?: string;
  siteId: string | null;  // Single source of truth
  createdAt: Date;
  updatedAt?: Date;
}
```

### `sites/{siteId}`
```typescript
{
  ownerUserId: string;  // Links to users/{uid}
  siteId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  templateKey: string;
  // ... wizard output (config, etc.)
}
```

**Removed:**
- ❌ `websites` collection
- ❌ `setupStatus` field
- ❌ `websiteId` field on User

## Route Guards

### `/builder` (Wizard)
- ✅ Requires authentication
- ✅ `requireNoSite={true}` - Redirects to dashboard if `user.siteId` exists
- ✅ Only allows access if `user.siteId` is null/empty

### `/site/[siteId]/admin` (Dashboard)
- ✅ Requires authentication
- ✅ Requires `user.siteId === siteId` (ownership)
- ✅ Verifies site exists and `ownerUserId === user.id`

## Testing Checklist

- [ ] **Signup:**
  - Sign up → Should create `users/{uid}` with `siteId=null`
  - Should redirect to `/builder` (wizard)
  - Complete wizard → Should create `sites/{siteId}` and update `users/{uid}.siteId`
  - Should redirect to `/site/{siteId}/admin`

- [ ] **Login (Has SiteId):**
  - Login with user who has `siteId` → Should redirect to `/site/{siteId}/admin`
  - Should **NEVER** show wizard

- [ ] **Login (No SiteId):**
  - Login with user who has `siteId=null` → Should redirect to `/builder`

- [ ] **Route Guards:**
  - Try `/builder` when `user.siteId` exists → Should redirect to dashboard
  - Try `/site/{siteId}/admin` when `user.siteId !== siteId` → Should redirect to own site

- [ ] **Debug Logs:**
  - Check console for: `[routeAfterAuth] uid=..., siteId=... -> redirect=...`

## Summary

✅ **Single source of truth:** `users/{uid}.siteId`
✅ **Site created ONLY after wizard completion** (not at signup)
✅ **Login skips wizard** if `siteId` exists
✅ **Signup goes to wizard** (no siteId yet)
✅ **Removed `websites` collection** - using `sites` directly
✅ **Removed `setupStatus`** - siteId presence is the check
✅ **O(1) lookups** - Direct read of `users/{uid}.siteId`
✅ **Single redirect function:** `routeAfterAuth(uid)`

The auth routing is now **simple, fast, and reliable**! 🎉
