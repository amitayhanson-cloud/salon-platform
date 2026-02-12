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

- **Tenant mapping:** `tenants/<slug>` → doc fields `{ siteId, ownerUid?, createdAt, updatedAt }`. Middleware resolves the request host (e.g. `alice.caleno.co`) to a slug, calls `GET /api/tenants/resolve?slug=alice`, then rewrites to **`/site/<siteId>/...`** (so the same app routes as the root domain, with no `/t/` segment).
- **Site document:** `sites/<siteId>` can include a top-level **`slug`** field; when set, the UI prefers the public URL `https://<slug>.caleno.co` over `/site/<siteId>` for links.

**Local development:**

- **Query param:** On localhost, use `?tenant=<slug>` to simulate a tenant. Example: [http://localhost:3000?tenant=alice](http://localhost:3000?tenant=alice) behaves like `alice.caleno.co`.
- **Subdomain:** If supported, [http://alice.localhost:3000](http://alice.localhost:3000) works without the query param.

**Firestore documents involved:**

- **`tenants/<slug>`** (doc id = slug): `siteId` (required), `ownerUid?`, `createdAt`, `updatedAt`. Server-only (Admin SDK); no client read/write in rules.
- **`sites/<siteId>`**: include **`slug`** (string) when the site has a subdomain; used for resolving slug → siteId and for UI public URLs.
- **`users/<uid>`**: `siteId` (primary site). Used when creating/linking tenants.

**Creating / changing subdomain:**

- **Account** page: shows current subdomain (if any), create or change via "צור תת-דומיין" / "החלף תת-דומיין". Slug rules: 3–30 chars, a-z, 0-9, hyphen, no leading/trailing hyphen; reserved slugs (e.g. `www`, `admin`, `api`, `login`) are rejected.
- **Create site:** `POST /api/create-website` accepts optional **`slug`**; if provided it is validated and used for both the website subdomain and the tenant. Response includes **`publicUrl`** (e.g. `https://<slug>.caleno.co`).
- **Rename subdomain:** `POST /api/tenants/change` with **`newSlug`** (auth required); updates `tenants`, `sites/<siteId>.slug`, and removes the old tenant doc.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
