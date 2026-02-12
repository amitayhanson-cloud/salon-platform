# Setup Instructions for Caleno Authentication

## Quick Start Guide

### 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable **Authentication** → **Email/Password** provider
4. Enable **Firestore Database** (start in test mode for development)

### 2. Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** → **General**
2. Scroll down to "Your apps" section
3. Click on the web app icon `</>` or select your existing web app
4. Copy the Firebase configuration object

### 3. Set Up Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your Firebase credentials in `.env.local`:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Development Server

```bash
npm run dev
```

Navigate to `http://localhost:3000`

### 6. Test the Authentication Flow

#### Test Signup:
1. Click "התחל לבנות את האתר שלך" on the landing page
2. Fill out the signup form with:
   - Name: "סלון יופי"
   - Email: test@example.com
   - Password: password123
   - Confirm Password: password123
3. Click "הרשמה ויצירת אתר"
4. You should be redirected to `/site/{websiteId}/admin`

#### Test Login:
1. Log out
2. Go to `/login`
3. Enter the credentials you created
4. You should be redirected to your website dashboard

#### Test Route Protection:
1. Copy your website ID from the URL
2. Log out
3. Try to access `/site/{websiteId}/admin` directly
4. You should be redirected to `/login`

## Firestore Collections Setup

The app will automatically create these collections:

### 1. `users` Collection
Stores user account information.

Example document:
```json
{
  "id": "firebase-auth-uid",
  "email": "user@example.com",
  "name": "John Doe",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "websiteId": "website-doc-id"
}
```

### 2. `websites` Collection
Stores website metadata and ownership.

Example document:
```json
{
  "id": "auto-generated-id",
  "ownerUserId": "firebase-auth-uid",
  "templateId": "luxury",
  "subdomain": "salon-yofi",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "isActive": true
}
```

### 3. `sites` Collection
Stores site configuration (existing).

## Firestore Security Rules

For production, update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Websites collection
    match /websites/{websiteId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.ownerUserId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.ownerUserId == request.auth.uid;
    }
    
    // Sites collection (configuration)
    match /sites/{siteId} {
      allow read: if true; // Public reading
      allow write: if request.auth != null && 
        exists(/databases/$(database)/documents/websites/$(siteId)) &&
        get(/databases/$(database)/documents/websites/$(siteId)).data.ownerUserId == request.auth.uid;
    }
    
    // Other collections (bookings, etc.)
    match /bookings/{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Authentication Features

✅ Email/Password signup and login
✅ Automatic website creation on signup
✅ Secure password hashing (handled by Firebase)
✅ Session persistence across page reloads
✅ Protected admin routes
✅ User-website ownership verification
✅ Automatic redirects based on auth state
✅ User-friendly error messages in Hebrew

## Common Issues

### Firebase not initialized
**Problem**: "Firebase לא מאותחל" error

**Solution**: 
- Make sure `.env.local` exists and has all required variables
- Restart the dev server: `npm run dev`
- Check that environment variables start with `NEXT_PUBLIC_`

### Authentication works but website not created
**Problem**: User is created but no website appears

**Solution**:
- Check browser console for API errors
- Check Firestore rules allow write access to `websites` collection
- Check the `/api/create-website` route logs

### User redirected to login after successful signup
**Problem**: Signup succeeds but immediately redirected to login

**Solution**:
- Check that `AuthProvider` is wrapping your app in `app/layout.tsx`
- Check browser console for auth state errors
- Clear browser cache and cookies

### Cannot access admin dashboard
**Problem**: User is logged in but cannot access `/site/{siteId}/admin`

**Solution**:
- Check that the user owns the website (check Firestore `websites` collection)
- Check that `user.websiteId` matches the `siteId` in the URL
- Check browser console for authorization errors

## File Changes Summary

### New Files Created:
- `app/signup/page.tsx` - Signup page
- `app/api/create-website/route.ts` - Website creation API
- `app/api/get-user-website/route.ts` - Get user website API
- `types/user.ts` - User and Website type definitions
- `lib/firestoreUsers.ts` - Firestore user/website helpers
- `components/auth/ProtectedRoute.tsx` - Route protection component
- `.env.local.example` - Environment variables template
- `AUTH_IMPLEMENTATION.md` - Detailed documentation
- `SETUP_INSTRUCTIONS.md` - This file

### Modified Files:
- `components/auth/AuthProvider.tsx` - Updated to use Firebase Auth
- `app/login/page.tsx` - Updated to redirect to user dashboard
- `app/(main)/page.tsx` - Added auth-aware "Get Started" button
- `app/(site)/site/[siteId]/admin/layout.tsx` - Added route protection
- `components/Header.tsx` - Added auth state and signup button

## Next Steps

1. **Test the complete flow** from signup to dashboard access
2. **Set up Firebase security rules** for production
3. **Add email verification** (optional but recommended)
4. **Implement password reset** functionality
5. **Add user profile page** for account management
6. **Deploy to production** and update Firebase authorized domains

## Development Tips

- Use different email addresses for testing multiple accounts
- Check Firebase Console → Authentication to see registered users
- Check Firestore Console to see created documents
- Use browser DevTools to debug auth state and API calls
- Clear localStorage if you need to fully reset local state

## Support

If you encounter issues:
1. Check browser console for errors
2. Check Firebase Console for auth/Firestore errors
3. Review the `AUTH_IMPLEMENTATION.md` for detailed documentation
4. Check that all environment variables are correctly set

Happy building! 🚀
