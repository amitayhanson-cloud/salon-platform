# Firebase Configuration Guide

## ⚠️ Important: Environment Variables Required

This app requires Firebase configuration to run. If you see an error banner at the top of the page, follow these steps:

### Quick Fix

1. **Create `.env.local`** in the project root
2. **Add your Firebase credentials** (see below)
3. **Restart the dev server**: `npm run dev`

### Required Environment Variables

Create a file named `.env.local` in the project root with:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

### Getting Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → ⚙️ Project Settings → General
3. Scroll to "Your apps" → Click Web app icon (`</>`)
4. Copy the configuration values

### API Key Format

- ✅ **Correct**: `AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567` (starts with "AIza")
- ❌ **Wrong**: `5c4f2a3a5d...` (not a Firebase Web API key)

### After Updating `.env.local`

**You MUST restart your dev server:**
```bash
npm run dev
```

For detailed instructions, see `FIREBASE_ENV_SETUP.md`.
