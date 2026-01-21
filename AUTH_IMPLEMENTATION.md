# Authentication Implementation

This document describes the authentication and user-website ownership implementation for the Salon Platform SaaS application.

## Overview

The platform now supports full user authentication with Firebase Authentication, automatic website creation upon signup, and secure route protection to ensure users can only access their own website dashboards.

## Features Implemented

### 1. User Authentication
- **Email/Password Authentication**: Users can sign up and log in using email and password
- **Firebase Authentication**: Secure authentication using Firebase Auth
- **Session Management**: Automatic session persistence and restoration on page reload
- **Error Handling**: User-friendly error messages in Hebrew

### 2. User-Website Ownership
- **Automatic Website Creation**: When a user signs up, a website is automatically created and linked to their account
- **One-to-One Relationship**: Each user owns one website (can be extended later)
- **Unique Subdomains**: Each website gets a unique subdomain generated from the salon name

### 3. Data Model

#### User Document (`users` collection)
```typescript
{
  id: string;              // Firebase Auth UID
  email: string;           // User's email
  name?: string;           // Optional display name
  createdAt: Date;         // Account creation timestamp
  websiteId?: string;      // Reference to user's website
}
```

#### Website Document (`websites` collection)
```typescript
{
  id: string;              // Auto-generated document ID
  ownerUserId: string;     // Reference to user document
  templateId: string;      // Template used (e.g., "luxury")
  subdomain: string;       // Unique subdomain
  customDomain?: string;   // Optional custom domain
  createdAt: Date;         // Creation timestamp
  updatedAt: Date;         // Last update timestamp
  isActive: boolean;       // Whether the website is active
}
```

### 4. Authentication Flow

#### Signup Flow:
1. User clicks "Create Website" on landing page
2. Redirected to `/signup` page
3. User enters email, password, and name
4. System creates Firebase Auth account
5. System creates Firestore user document
6. API route automatically creates website document with unique subdomain
7. User document is updated with `websiteId`
8. Initial site config is created in `sites` collection
9. User is redirected to their website dashboard at `/site/{websiteId}/admin`

#### Login Flow:
1. User navigates to `/login`
2. User enters email and password
3. Firebase authenticates the credentials
4. AuthProvider fetches user document from Firestore
5. User is automatically redirected to their website dashboard (if they have one) or to `/builder`

### 5. Route Protection

#### Protected Admin Routes
All admin routes under `/site/[siteId]/admin` are protected:
- User must be authenticated
- User must own the website they're trying to access
- Unauthorized users are redirected appropriately

#### Implementation
The admin layout checks:
```typescript
- If user is not logged in → redirect to /login
- If user doesn't own this siteId → redirect to their own site or /builder
- Otherwise → grant access
```

### 6. Landing Page Updates
The landing page now:
- Shows different buttons based on auth state
- "התחל לבנות את האתר שלך" (Get Started) for non-authenticated users → `/signup`
- "עבור לדשבורד" (Go to Dashboard) for authenticated users with a website
- "המשך לבניית אתר" (Continue Building) for authenticated users without a website

### 7. Header Navigation
The header component now displays:
- For non-authenticated users:
  - "התחברות" (Login) button
  - "הרשמה" (Sign up) button
- For authenticated users:
  - User name/email (links to their dashboard)
  - "התנתקות" (Logout) button

## API Routes

### POST `/api/create-website`
Creates a new website for a user during signup.

**Request Body:**
```json
{
  "userId": "string",
  "salonName": "string"
}
```

**Response:**
```json
{
  "success": true,
  "websiteId": "string",
  "subdomain": "string"
}
```

## Security Features

### Password Security
- Passwords are hashed by Firebase Authentication
- Minimum password length: 6 characters
- Password confirmation required during signup

### Route Protection
- Admin routes check user authentication and ownership
- Unauthorized access attempts are redirected
- Loading states prevent UI flashing

### Data Validation
- Email format validation
- Password strength requirements
- Subdomain uniqueness checks
- Error messages in Hebrew for better UX

## Firebase Configuration

### Required Environment Variables
Create a `.env.local` file with:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Firestore Collections
The following collections need to be set up in Firebase:
1. `users` - User documents
2. `websites` - Website documents
3. `sites` - Site configuration documents

### Firestore Security Rules (Recommended)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can read/write websites they own
    match /websites/{websiteId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        resource.data.ownerUserId == request.auth.uid;
    }
    
    // Users can read/write site configs for their websites
    match /sites/{siteId} {
      allow read: if true; // Public sites
      allow write: if request.auth != null &&
        get(/databases/$(database)/documents/websites/$(siteId)).data.ownerUserId == request.auth.uid;
    }
  }
}
```

## File Structure

```
salon-platform/
├── app/
│   ├── (main)/
│   │   └── page.tsx                    # Landing page (updated)
│   ├── (site)/
│   │   └── site/[siteId]/admin/
│   │       └── layout.tsx              # Protected admin layout
│   ├── api/
│   │   ├── create-website/
│   │   │   └── route.ts                # Website creation API
│   │   └── get-user-website/
│   │       └── route.ts                # Get user's website API
│   ├── login/
│   │   └── page.tsx                    # Login page (updated)
│   └── signup/
│       └── page.tsx                    # New signup page
├── components/
│   ├── auth/
│   │   ├── AuthProvider.tsx            # Firebase auth provider
│   │   └── ProtectedRoute.tsx          # Route protection component
│   └── Header.tsx                       # Updated header
├── lib/
│   ├── firebaseClient.ts               # Firebase client config
│   ├── firebaseAdmin.ts                # Firebase admin config
│   └── firestoreUsers.ts               # User/website Firestore helpers
└── types/
    └── user.ts                          # User and Website types
```

## Usage Examples

### Protecting a Route
```tsx
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

export default function DashboardPage() {
  return (
    <ProtectedRoute requireWebsite={true}>
      <div>Protected content</div>
    </ProtectedRoute>
  );
}
```

### Using Auth Context
```tsx
import { useAuth } from "@/components/auth/AuthProvider";

export default function MyComponent() {
  const { user, loading, login, logout } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  
  return (
    <div>
      {user ? (
        <button onClick={logout}>Logout</button>
      ) : (
        <button onClick={() => login(email, password)}>Login</button>
      )}
    </div>
  );
}
```

## Testing

### Test the Signup Flow:
1. Navigate to the landing page
2. Click "התחל לבנות את האתר שלך"
3. Fill out the signup form
4. Verify you're redirected to the admin dashboard
5. Check Firestore to see the created user and website documents

### Test the Login Flow:
1. Log out from the current session
2. Navigate to `/login`
3. Enter your credentials
4. Verify you're redirected to your website dashboard

### Test Route Protection:
1. Try to access `/site/{someOtherSiteId}/admin`
2. Verify you're redirected to your own site or login page

## Future Enhancements

- [ ] Email verification
- [ ] Password reset functionality
- [ ] Support for multiple websites per user
- [ ] OAuth providers (Google, Facebook)
- [ ] Two-factor authentication
- [ ] User profile management page
- [ ] Website transfer/ownership transfer
- [ ] Team member invitations and permissions

## Troubleshooting

### "Firebase not initialized" error
- Check that all environment variables are set correctly
- Ensure `.env.local` is in the project root
- Restart the development server after changing env variables

### User redirected to login after signup
- Check browser console for errors
- Verify Firebase Auth is enabled in Firebase Console
- Check Firestore rules allow write access to users collection

### Website creation fails
- Check Firestore rules allow write access to websites collection
- Verify the subdomain generation logic doesn't create duplicates
- Check API route logs for specific errors

## Support

For issues or questions about the authentication implementation, please check:
1. Firebase Console for auth and Firestore errors
2. Browser console for client-side errors
3. Server logs for API route errors
