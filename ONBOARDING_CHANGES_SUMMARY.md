# Onboarding State Management - Changes Summary

## Problem
- Login was sending users to wizard even after completing setup
- No way to track if user completed onboarding
- Users had to go through wizard every time they logged in

## Solution
Implemented `setupStatus` field on website documents to track onboarding state:
- `"not_started"` - New website, wizard not started
- `"in_progress"` - Wizard started but not finished  
- `"completed"` - Wizard completed, user can access dashboard

## Files Changed

### 1. `types/user.ts`
**Added:**
```typescript
export type SetupStatus = "not_started" | "in_progress" | "completed";

export type Website = {
  // ... existing fields
  setupStatus: SetupStatus; // NEW
};
```

### 2. `lib/firestoreUsers.ts`
**Updated:**
- `createWebsiteDocument()` - Sets `setupStatus: "not_started"` for new websites
- `getWebsiteByOwnerId()` - Returns `setupStatus` field
- `getWebsiteById()` - Returns `setupStatus` field

### 3. `lib/firestoreWebsites.ts` (NEW)
**Created helper functions:**
- `updateWebsiteSetupStatus(websiteId, status)`
- `completeWebsiteSetup(websiteId)`
- `setWebsiteSetupInProgress(websiteId)`

### 4. `components/auth/AuthProvider.tsx`
**Major changes:**
- Added `website` state to context
- `login()` now:
  - Fetches website document
  - Returns `redirectPath` based on `setupStatus`
  - `setupStatus === "completed"` → `/site/{websiteId}/admin`
  - `setupStatus !== "completed"` → `/builder?websiteId={websiteId}`
- `onAuthStateChanged` fetches website and updates state

### 5. `app/signup/page.tsx`
**Changed redirect:**
- Before: `/site/${websiteId}/admin`
- After: `/builder?websiteId=${websiteId}`

### 6. `app/login/page.tsx`
**Updated:**
- Uses `redirectPath` from `login()` result
- Redirects automatically based on setup status

### 7. `app/(main)/builder/page.tsx`
**Major changes:**
- Reads `websiteId` from query params: `?websiteId=...`
- Uses `websiteId` when saving (instead of generating from name)
- `handleFinish()`:
  - Calls `completeWebsiteSetup(websiteId)` 
  - Redirects to `/site/{siteId}/admin` (dashboard)
- Added redirect guard: If setup completed → redirect to dashboard
- Wrapped with `RouteGuard` component

### 8. `app/(main)/page.tsx`
**Updated `handleGetStarted()`:**
- Checks website `setupStatus`
- `setupStatus === "completed"` → `/site/{websiteId}/admin`
- `setupStatus !== "completed"` → `/builder?websiteId={websiteId}`
- No website → `/builder`

### 9. `app/(site)/site/[siteId]/admin/layout.tsx`
**Added setup status check:**
- Fetches website document
- If `setupStatus !== "completed"` → Redirects to `/builder?websiteId={siteId}`

### 10. `components/auth/RouteGuard.tsx` (NEW)
**Reusable route guard component:**
- `requireAuth` - Requires authentication
- `requireSetupCompleted` - Redirects to wizard if not completed
- `requireSetupNotCompleted` - Redirects to dashboard if completed

## Flow Examples

### First-Time Signup
```
1. User signs up → Creates Firebase Auth user
2. API creates website with setupStatus="not_started"
3. Redirect → /builder?websiteId={websiteId}
4. User completes wizard
5. completeWebsiteSetup(websiteId) → setupStatus="completed"
6. Redirect → /site/{websiteId}/admin
```

### Existing User Login (Completed)
```
1. User logs in
2. Fetch website → setupStatus="completed"
3. Redirect → /site/{websiteId}/admin ✅
```

### Existing User Login (Not Completed)
```
1. User logs in
2. Fetch website → setupStatus="not_started"
3. Redirect → /builder?websiteId={websiteId} ✅
```

## Firestore Queries Used

### Get Website by Owner User ID
```typescript
const websitesRef = collection(db, "websites");
const q = query(websitesRef, where("ownerUserId", "==", userId));
const querySnapshot = await getDocs(q);
```

**Required Index:** `websites` collection → `ownerUserId` (ascending)

### Get Website by ID
```typescript
const websiteRef = doc(db, "websites", websiteId);
const websiteSnap = await getDoc(websiteRef);
```

**No index needed** (direct document access)

## Route Protection

### `/builder` (Wizard)
- ✅ Requires auth
- ✅ Redirects to dashboard if `setupStatus === "completed"`
- ✅ Allows access if `setupStatus !== "completed"`

### `/site/[siteId]/admin` (Dashboard)
- ✅ Requires auth
- ✅ Requires ownership
- ✅ Requires `setupStatus === "completed"`
- ✅ Redirects to wizard if not completed

## Testing

### Test Signup Flow
1. Sign up with new email
2. ✅ Should redirect to `/builder?websiteId=...`
3. Complete wizard
4. ✅ Should redirect to `/site/{websiteId}/admin`
5. ✅ Check Firestore: `websites/{websiteId}.setupStatus === "completed"`

### Test Login Flow (Completed)
1. Login with user who completed setup
2. ✅ Should redirect to `/site/{websiteId}/admin`
3. ✅ Should NOT see wizard

### Test Login Flow (Not Completed)
1. Login with user who hasn't completed setup
2. ✅ Should redirect to `/builder?websiteId={websiteId}`
3. ✅ Should be able to complete wizard

### Test Route Guards
1. Try `/builder` when setup completed → ✅ Redirects to dashboard
2. Try `/site/{siteId}/admin` when setup not completed → ✅ Redirects to wizard
3. Try `/builder` when not logged in → ✅ Redirects to login

## Firestore Index Required

**Collection:** `websites`
**Fields:** `ownerUserId` (Ascending)

**To create:**
1. Go to Firebase Console → Firestore → Indexes
2. Click "Create Index"
3. Collection: `websites`
4. Fields: `ownerUserId` (Ascending)
5. Create

## Summary

✅ **Onboarding state stored on website document** (`setupStatus` field)
✅ **Signup redirects to wizard** (not dashboard)
✅ **Login checks setup status** and redirects accordingly
✅ **Wizard completion marks setup as completed**
✅ **Route guards prevent wrong access**
✅ **"Create Website" button respects setup status**
✅ **Works with auth state persistence**

The implementation ensures:
- First-time users go through wizard
- Existing users skip wizard and go to dashboard
- Route guards prevent access errors
- State persists across page refreshes

🎉 **Onboarding flow is now complete!**
