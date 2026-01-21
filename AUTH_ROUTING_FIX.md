# Auth Routing & Post-Auth Redirects - Implementation Summary

## Problem
- Login was sending users to wizard even after completing setup
- No consistent redirect logic
- Landing page buttons didn't properly handle auth state

## Solution
Implemented shared redirect helpers and consistent routing logic based on `setupStatus`.

## Files Changed

### 1. `lib/authRedirect.ts` (NEW)
**Created shared helper functions:**

```typescript
// Get user's website state (O(1) lookup via users/{uid}.websiteId)
getUserWebsiteState(userId): Promise<WebsiteState>

// Determine redirect path based on setup status
getRedirectPathAfterAuth(websiteState): string

// Complete redirect logic: get state + return path
redirectAfterAuth(userId): Promise<string>
```

**Logic:**
- Uses `users/{uid}.websiteId` for O(1) lookup
- Falls back to query `websites` by `ownerUserId` if needed
- Returns redirect path:
  - `setupStatus === "completed"` → `/site/{websiteId}/admin`
  - `setupStatus !== "completed"` → `/builder?websiteId={websiteId}`
  - No website → `/builder`

### 2. `components/auth/AuthProvider.tsx`
**Updated:**
- `login()` now uses `redirectAfterAuth()` helper
- Returns `redirectPath` that skips wizard if setup completed
- `onAuthStateChanged` uses `getUserWebsiteState()` helper

**Key Change:**
```typescript
// Before: Complex nested logic
// After: Simple shared helper
const redirectPath = await redirectAfterAuth(userId);
return { success: true, redirectPath };
```

### 3. `app/login/page.tsx`
**Already correct:**
- Uses `redirectPath` from `login()` result
- Redirects automatically: `router.push(result.redirectPath)`

**Behavior:**
- ✅ Login → Skip wizard if `setupStatus === "completed"`
- ✅ Login → Go to wizard if `setupStatus !== "completed"`

### 4. `app/signup/page.tsx`
**Already correct:**
- Creates website with `setupStatus="not_started"`
- Redirects to `/builder?websiteId={websiteId}`

**Behavior:**
- ✅ Signup → Always goes to wizard (first-time setup)

### 5. `app/(main)/page.tsx` (Landing Page)
**Updated:**
- Added `handleLogin()` → `/login`
- Added `handleSignup()` → `/signup`
- Added `handleGoToDashboard()` → Uses `redirectAfterAuth()`
- Updated button UI:
  - **Not logged in:** Shows "התחברות" and "הרשמה" buttons
  - **Logged in:** Shows "לדשבורד" button (uses redirect logic)

**Before:**
```tsx
<button onClick={handleGetStarted}>
  {user ? "עבור לדשבורד" : "התחל לבנות את האתר שלך"}
</button>
```

**After:**
```tsx
{user ? (
  <button onClick={handleGoToDashboard}>לדשבורד</button>
) : (
  <>
    <button onClick={handleLogin}>התחברות</button>
    <button onClick={handleSignup}>הרשמה</button>
  </>
)}
```

### 6. `components/Header.tsx`
**Updated:**
- Added `handleGoToDashboard()` → Uses `redirectAfterAuth()`
- Changed user name link to button that uses redirect logic

**Before:**
```tsx
<Link href={user.websiteId ? `/site/${user.websiteId}/admin` : "/builder"}>
  {user.name || user.email}
</Link>
```

**After:**
```tsx
<button onClick={handleGoToDashboard}>
  {user.name || user.email}
</button>
```

### 7. `app/(site)/site/[siteId]/admin/layout.tsx`
**Already correct:**
- Checks `setupStatus !== "completed"` → Redirects to wizard
- Protects dashboard routes

### 8. `app/(main)/builder/page.tsx`
**Already correct:**
- Redirects to dashboard if `setupStatus === "completed"`
- Wrapped with `RouteGuard` to prevent completed users

## Flow Diagrams

### Signup Flow
```
1. User clicks "הרשמה" → /signup
2. User submits form
3. createUserWithEmailAndPassword() → Creates Firebase Auth user
4. createUserDocument() → Creates users/{uid}
5. POST /api/create-website → Creates websites/{websiteId} with setupStatus="not_started"
6. Redirect → /builder?websiteId={websiteId} ✅
7. User completes wizard
8. completeWebsiteSetup() → setupStatus="completed"
9. Redirect → /site/{websiteId}/admin ✅
```

### Login Flow (Setup Completed)
```
1. User clicks "התחברות" → /login
2. User submits credentials
3. signInWithEmailAndPassword() → Authenticates
4. getUserWebsiteState() → Fetches website (O(1) via users/{uid}.websiteId)
5. Check setupStatus === "completed"
6. Redirect → /site/{websiteId}/admin ✅ (SKIPS WIZARD)
```

### Login Flow (Setup Not Completed)
```
1. User clicks "התחברות" → /login
2. User submits credentials
3. signInWithEmailAndPassword() → Authenticates
4. getUserWebsiteState() → Fetches website
5. Check setupStatus !== "completed"
6. Redirect → /builder?websiteId={websiteId} ✅ (RESUME WIZARD)
```

### "לדשבורד" Button Flow
```
1. User clicks "לדשבורד" (logged in)
2. redirectAfterAuth(userId) → Gets website state
3. Check setupStatus:
   - "completed" → /site/{websiteId}/admin ✅
   - "not_started" → /builder?websiteId={websiteId} ✅
   - No website → /builder ✅
```

## Route Guards

### `/builder` (Wizard)
- ✅ Requires authentication
- ✅ Redirects to dashboard if `setupStatus === "completed"`
- ✅ Allows access if `setupStatus !== "completed"`

### `/site/[siteId]/admin` (Dashboard)
- ✅ Requires authentication
- ✅ Requires ownership (`user.websiteId === siteId`)
- ✅ Requires `setupStatus === "completed"`
- ✅ Redirects to wizard if setup not completed

## Data Model

### `users/{uid}`
```typescript
{
  id: string;
  email: string;
  name?: string;
  websiteId?: string;  // O(1) lookup for redirect
  createdAt: Date;
}
```

### `websites/{websiteId}`
```typescript
{
  id: string;
  ownerUserId: string;
  setupStatus: "not_started" | "in_progress" | "completed";
  templateId: string;
  subdomain: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}
```

## Firestore Queries

### Primary (O(1))
```typescript
// Get user document
doc(db, "users", userId)

// Get website by ID (if user has websiteId)
doc(db, "websites", websiteId)
```

### Fallback (Requires Index)
```typescript
// Query websites by ownerUserId
query(collection(db, "websites"), where("ownerUserId", "==", userId))
```

**Required Index:** `websites` collection → `ownerUserId` (ascending)

## Testing Checklist

- [ ] **Signup:**
  - Click "הרשמה" → Should go to `/signup`
  - Complete signup → Should redirect to `/builder?websiteId=...`
  - Complete wizard → Should redirect to `/site/{websiteId}/admin`

- [ ] **Login (Completed Setup):**
  - Click "התחברות" → Should go to `/login`
  - Login with completed user → Should redirect to `/site/{websiteId}/admin` (SKIP WIZARD)

- [ ] **Login (Not Completed):**
  - Login with incomplete user → Should redirect to `/builder?websiteId={websiteId}`

- [ ] **Landing Page Buttons:**
  - Not logged in → Shows "התחברות" and "הרשמה"
  - Logged in → Shows "לדשבורד"
  - Click "לדשבורד" → Should use redirect logic

- [ ] **Header:**
  - Not logged in → Shows "התחברות" and "הרשמה"
  - Logged in → Shows user name (button) and "התנתקות"
  - Click user name → Should use redirect logic

- [ ] **Route Guards:**
  - Try `/builder` when setup completed → Should redirect to dashboard
  - Try `/site/{siteId}/admin` when setup not completed → Should redirect to wizard

## Summary

✅ **Shared redirect helpers** - `lib/authRedirect.ts`
✅ **Login skips wizard** if `setupStatus === "completed"`
✅ **Signup goes to wizard** (first-time setup)
✅ **Landing page buttons** - Separate login/signup, dashboard for logged-in users
✅ **Header buttons** - Use redirect logic
✅ **Route guards** - Protect wizard and dashboard routes
✅ **O(1) lookups** - Uses `users/{uid}.websiteId` for fast redirects

The auth routing is now clean, consistent, and properly separates first-time setup (wizard) from returning users (dashboard)! 🎉
