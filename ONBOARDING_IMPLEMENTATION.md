# Onboarding State Management Implementation

## Overview
Implemented onboarding/setup state management to ensure:
- **First-time signup** → Wizard flow (setup not completed)
- **Existing user login** → Skip wizard, go directly to dashboard (setup completed)

## Data Model

### Website Document (`websites/{websiteId}`)
```typescript
{
  id: string;
  ownerUserId: string;
  templateId: string;
  subdomain: string;
  setupStatus: "not_started" | "in_progress" | "completed";
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}
```

**Setup Status Values:**
- `"not_started"` - New website, wizard not started
- `"in_progress"` - Wizard started but not finished
- `"completed"` - Wizard completed, user can access dashboard

## Files Changed

### 1. `types/user.ts`
**Added:**
- `SetupStatus` type: `"not_started" | "in_progress" | "completed"`
- `setupStatus` field to `Website` type

### 2. `lib/firestoreUsers.ts`
**Updated:**
- `createWebsiteDocument()` - Sets `setupStatus: "not_started"` for new websites
- `getWebsiteByOwnerId()` - Returns `setupStatus` (defaults to `"not_started"` for backward compatibility)
- `getWebsiteById()` - Returns `setupStatus` (defaults to `"not_started"` for backward compatibility)

### 3. `lib/firestoreWebsites.ts` (NEW)
**Created:**
- `updateWebsiteSetupStatus()` - Updates setup status
- `completeWebsiteSetup()` - Marks setup as completed
- `setWebsiteSetupInProgress()` - Marks setup as in progress

### 4. `components/auth/AuthProvider.tsx`
**Updated:**
- Added `website` state to context
- `login()` now:
  - Fetches website document
  - Returns `redirectPath` based on `setupStatus`:
    - `setupStatus === "completed"` → `/site/{websiteId}/admin`
    - `setupStatus !== "completed"` → `/builder?websiteId={websiteId}`
    - No website → `/builder`
- `signup()` returns `userId` (website creation happens in API route)
- `onAuthStateChanged` now fetches website and updates state

### 5. `app/signup/page.tsx`
**Updated:**
- After website creation → Redirects to `/builder?websiteId={websiteId}` (not dashboard)

### 6. `app/login/page.tsx`
**Updated:**
- Uses `redirectPath` from `login()` result
- Redirects based on setup status automatically

### 7. `app/(main)/builder/page.tsx`
**Updated:**
- Reads `websiteId` from query params: `?websiteId=...`
- Uses `websiteId` when saving site config (instead of generating from name)
- `handleFinish()` now:
  - Marks website setup as completed: `completeWebsiteSetup(websiteId)`
  - Redirects to `/site/{siteId}/admin` (dashboard, not public site)
- Added redirect guard: If user already completed setup → redirect to dashboard
- Wrapped with `RouteGuard` to prevent completed users from accessing wizard

### 8. `app/(main)/page.tsx`
**Updated:**
- `handleGetStarted()` now:
  - Checks if user has website
  - Fetches website to check `setupStatus`
  - If `setupStatus === "completed"` → `/site/{websiteId}/admin`
  - If `setupStatus !== "completed"` → `/builder?websiteId={websiteId}`
  - No website → `/builder`

### 9. `app/(site)/site/[siteId]/admin/layout.tsx`
**Updated:**
- Checks website `setupStatus` before allowing access
- If `setupStatus !== "completed"` → Redirects to `/builder?websiteId={siteId}`

### 10. `components/auth/RouteGuard.tsx` (NEW)
**Created:**
- Reusable route guard component
- Props:
  - `requireAuth` - Requires user to be logged in
  - `requireSetupCompleted` - Redirects to wizard if setup not completed
  - `requireSetupNotCompleted` - Redirects to dashboard if setup completed

## Flow Diagrams

### Signup Flow
```
1. User submits signup form
2. createUserWithEmailAndPassword() → Creates Firebase Auth user
3. createUserDocument() → Creates users/{uid} document
4. POST /api/create-website → Creates websites/{websiteId} with setupStatus="not_started"
5. Redirect → /builder?websiteId={websiteId}
6. User completes wizard
7. handleFinish() → completeWebsiteSetup(websiteId)
8. Redirect → /site/{websiteId}/admin
```

### Login Flow
```
1. User submits login form
2. signInWithEmailAndPassword() → Authenticates user
3. getUserDocument() → Fetches users/{uid}
4. getWebsiteById() → Fetches websites/{websiteId}
5. Check setupStatus:
   - If "completed" → Redirect to /site/{websiteId}/admin
   - If "not_started" or "in_progress" → Redirect to /builder?websiteId={websiteId}
   - If no website → Redirect to /builder
```

## Route Guards

### `/builder` (Wizard)
- ✅ Requires authentication
- ✅ Redirects to dashboard if `setupStatus === "completed"`
- ✅ Allows access if `setupStatus !== "completed"`

### `/site/[siteId]/admin` (Dashboard)
- ✅ Requires authentication
- ✅ Requires user to own the website
- ✅ Requires `setupStatus === "completed"`
- ✅ Redirects to wizard if setup not completed

## Firestore Queries

### Get Website by Owner
```typescript
const websitesRef = collection(db, "websites");
const q = query(websitesRef, where("ownerUserId", "==", userId));
const querySnapshot = await getDocs(q);
```

**Index Required:** `websites` collection → `ownerUserId` (ascending)

### Get Website by ID
```typescript
const websiteRef = doc(db, "websites", websiteId);
const websiteSnap = await getDoc(websiteRef);
```

**No index needed** (direct document access)

## Testing Checklist

- [ ] **First-time signup:**
  - Sign up with new email
  - Should redirect to `/builder?websiteId=...`
  - Complete wizard
  - Should redirect to `/site/{websiteId}/admin`
  - Check Firestore: `websites/{websiteId}.setupStatus === "completed"`

- [ ] **Existing user login (completed):**
  - Login with user who completed setup
  - Should redirect to `/site/{websiteId}/admin`
  - Should NOT see wizard

- [ ] **Existing user login (not completed):**
  - Login with user who hasn't completed setup
  - Should redirect to `/builder?websiteId={websiteId}`
  - Should be able to complete wizard

- [ ] **Route guards:**
  - Try accessing `/builder` when setup completed → Should redirect to dashboard
  - Try accessing `/site/{siteId}/admin` when setup not completed → Should redirect to wizard
  - Try accessing `/builder` when not logged in → Should redirect to login

- [ ] **"Create Website" button:**
  - Not logged in → `/signup`
  - Logged in, setup completed → `/site/{websiteId}/admin`
  - Logged in, setup not completed → `/builder?websiteId={websiteId}`

- [ ] **Auth state persistence:**
  - Login → Refresh page → Should maintain auth state
  - Should redirect correctly based on setup status

## Firestore Indexes

Create this index in Firebase Console:

**Collection:** `websites`
**Fields:**
- `ownerUserId` (Ascending)

**Query:** `where("ownerUserId", "==", userId)`

## Summary

✅ **Onboarding state stored on website document** (`setupStatus` field)
✅ **Signup creates website with `setupStatus="not_started"`**
✅ **Login checks setup status and redirects accordingly**
✅ **Wizard completion marks setup as `"completed"`**
✅ **Route guards prevent wrong access**
✅ **"Create Website" button respects setup status**
✅ **Works with auth state persistence**

The implementation ensures users only see the wizard when needed and skip directly to their dashboard after completing setup! 🎉
