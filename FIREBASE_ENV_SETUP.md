# Firebase Environment Variables Setup

## Quick Setup

1. **Create `.env.local` file** in the project root (same directory as `package.json`)

2. **Add these variables** (replace with your actual Firebase values):

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123def456
```

3. **Restart your dev server** after creating/updating `.env.local`:
   ```bash
   npm run dev
   ```

## How to Get Your Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (or create a new one)
3. Click the gear icon ⚙️ → **Project Settings**
4. Go to the **General** tab
5. Scroll down to **"Your apps"** section
6. Click the **Web app icon** (`</>`) or select your existing web app
7. Copy the configuration values shown

## Important Notes

### API Key Format
- **MUST start with `AIza`** (Firebase Web API key)
- Should be approximately 40 characters long
- Example: `AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567`

### Common Mistakes
- ❌ Using a key that starts with `5c4f...` or other prefixes (this is NOT a Firebase Web API key)
- ❌ Adding trailing characters like `:1` to the API key
- ❌ Forgetting to restart the dev server after updating `.env.local`
- ❌ Using quotes around values in `.env.local` (don't use quotes)

### After Updating `.env.local`
**You MUST restart your dev server** for changes to take effect:
```bash
# Stop the server (Ctrl+C) and restart:
npm run dev
```

## Troubleshooting

### Error: "Firebase API key format invalid"
- Check that your `NEXT_PUBLIC_FIREBASE_API_KEY` starts with `AIza`
- Make sure there are no extra characters or spaces
- Verify you're using the **Web API key**, not a server key or other type

### Error: "Firebase env missing"
- Check that all 6 environment variables are set in `.env.local`
- Make sure variable names start with `NEXT_PUBLIC_`
- Verify there are no typos in variable names
- Restart your dev server after adding variables

### App shows "Firebase config missing/invalid" banner
- Check browser console for detailed error messages
- Verify `.env.local` exists in the project root
- Ensure all values are filled in (no empty values)
- Restart dev server after making changes

## Example `.env.local` File

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=my-salon-platform.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=my-salon-platform
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=my-salon-platform.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

**Note:** Never commit `.env.local` to git (it's already in `.gitignore`)
