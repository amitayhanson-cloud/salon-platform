# Caleno

[Caleno](https://caleno.co) – build a professional site for your salon in minutes. Next.js app with Firebase.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Development

### Pre-push Hook

This repository includes a pre-push hook that runs `npm run build` before allowing pushes. This prevents pushing broken code.

**Setup (one-time):**
```bash
chmod +x .git/hooks/pre-push
```

**To skip the hook (not recommended):**
```bash
git push --no-verify
```

### Verify Script

Run `npm run verify` to check linting and build before committing:
```bash
npm run verify
```

## Firebase Admin Setup (Required for Production)

For API routes that use Firebase Admin SDK, you need to set up service account credentials.

### Development
- Option 1: Place `salon-platform-34cec-firebase-adminsdk-fbsvc-f73cb413cd.json` in the project root
- Option 2: Set `FIREBASE_SERVICE_ACCOUNT_JSON` in `.env.local` (see `env.local.example`)

### Production (Vercel)
**REQUIRED:** Set `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable in Vercel:

1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Copy the entire JSON content
4. In Vercel Dashboard → Project Settings → Environment Variables:
   - Add `FIREBASE_SERVICE_ACCOUNT_JSON` with the full JSON as the value
   - Vercel will handle newlines automatically

**Important:** Without this variable, production builds will fail with "Missing FIREBASE_SERVICE_ACCOUNT_JSON" error.

## Domains

- **Primary:** https://caleno.co  
- **Redirect:** https://www.caleno.co → https://caleno.co  

Set `NEXT_PUBLIC_APP_URL=https://caleno.co` in production (see `env.local.example`).

### Multi-tenant subdomains

Each tenant (subdomain) maps to a **site** via Firestore:

- **Tenant mapping:** `tenants/<slug>` → doc fields `{ siteId, ownerUid, createdAt, updatedAt }`. The document ID is the slug. Middleware resolves the request host (e.g. `alice.caleno.co`) to a slug, calls `GET /api/tenants/resolve?slug=alice`, then rewrites to **`/site/<siteId>/...`** (same app routes as the root domain).
- **Site document:** `sites/<siteId>` includes **`slug`** when the site has a subdomain; the UI uses `https://<slug>.caleno.co` for links when available.
- **User document:** `users/<uid>` has **`siteId`** (primary site) and optionally **`primarySlug`** (current subdomain); used when creating or changing tenants.

**Slug rules (single source of truth: `lib/slug.ts`):**

- Length 3–30 characters.
- Allowed characters: `a-z`, `0-9`, hyphen. No leading or trailing hyphen; no consecutive hyphens (they are normalized to one).
- Reserved slugs cannot be used: `www`, `admin`, `api`, `login`, `app`, `mail`, `support`, `help`, `static`, `assets`, `cdn`, `dashboard`, `docs`, `billing`, `settings`, `auth`, `oauth`, `_next`.
- Validation: `validateSlug(slug)` returns `{ ok: true, normalized }` or `{ ok: false, error }` (Hebrew-friendly errors).

**How to change subdomain:**

1. Go to **Account** (or account/settings).
2. Under "תת-דומיין (Caleno)", enter the new slug and click **"בדוק זמינות"** (Check availability). This calls `GET /api/tenants/check?slug=<slug>` and shows whether the slug is available or the reason it is not.
3. Click **"החלף תת-דומיין"** (Change subdomain). This calls `POST /api/tenants/change` with `{ newSlug }` (auth required). The API runs a Firestore transaction: creates `tenants/<newSlug>`, deletes `tenants/<oldSlug>`, updates `sites/<siteId>.slug` and `users/<uid>.primarySlug`.
4. After success, the new URL is shown. **Note:** The old subdomain will stop working (no aliases in this MVP).

**APIs:**

- **`GET /api/tenants/check?slug=<slug>`** — Returns `200 { available: true }` if valid and not taken, or `200 { available: false, reason? }` if taken or invalid. Used for real-time validation in the wizard and account page.
- **`POST /api/tenants/change`** — Body `{ newSlug }`, auth required. Changes the current user’s tenant slug (transaction). Returns `{ success, slug, url, publicUrl }`.
- **`POST /api/tenants/create`** — Body `{ slug }`, auth required. Creates a tenant for the user’s site.
- **`GET /api/tenants/resolve?slug=<slug>`** — Returns `200 { siteId }` or 404. Used by middleware for routing.

**Local development:**

- **Query param:** On localhost, use **`?tenant=<slug>`** to simulate a tenant. Example: [http://localhost:3000?tenant=alice](http://localhost:3000?tenant=alice) behaves like `alice.caleno.co`.
- **Subdomain:** If your environment supports it, [http://alice.localhost:3000](http://alice.localhost:3000) works without the query param.

**Firestore security:**

- **`tenants/<slug>`**: Public read (for routing). Create only when `request.resource.data.ownerUid == request.auth.uid`. Update/delete only by owner; update cannot change `ownerUid` or `siteId`.
- **`users/<userId>`**: Read/write only by the authenticated user (same `userId`).
- **`sites/<siteId>`**: Read/write only by the owner (`ownerUid` / `ownerUserId`). Deploy rules with `firebase deploy --only firestore:rules`.

**Manual test steps (subdomain + slug):**

1. **Check endpoint:** `GET /api/tenants/check?slug=testfoo` → 200 with `{ available: true }` or `{ available: false, reason? }` (e.g. try reserved `admin` or an existing slug).
2. **Create via wizard:** Sign up through the builder; at step "בחר תת-דומיין" enter a valid slug (e.g. `testamitay`), click "בדוק זמינות", then complete the wizard. Firestore should have `tenants/testamitay` with correct `siteId`; `GET /api/tenants/resolve?slug=testamitay` returns 200.
3. **Change subdomain:** Log in, go to Account, enter a new slug, click "בדוק זמינות", then "החלף תת-דומיין". Response includes `url`; Firestore has `tenants/<newSlug>`, old `tenants/<oldSlug>` removed, `sites/<siteId>.slug` and `users/<uid>.primarySlug` updated.
4. **Verify old slug 404s:** After changing, `GET /api/tenants/resolve?slug=<oldSlug>` returns 404; `GET /api/tenants/resolve?slug=<newSlug>` returns 200. Open `https://<newSlug>.caleno.co/admin` (or localhost with `?tenant=<newSlug>`) and confirm it loads.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
