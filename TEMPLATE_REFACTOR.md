# Template System Refactor

## Summary

The website template system is now decoupled from any tenant site. Templates live in Firestore `templates/{templateKey}` and are used only when creating new sites. No runtime code reads from `amitay-hair-mk6krumy`.

## Files Changed

| File | Change |
|------|--------|
| `types/template.ts` | **NEW** – Template schema, `TemplateDoc`, `TemplateConfigDefaults` |
| `lib/firestoreTemplatesServer.ts` | **NEW** – `getTemplate`, `getTemplateConfigDefaults`, `createSiteFromTemplateServer` |
| `lib/mergeTemplateConfig.ts` | **NEW** – `mergeTemplateWithBuilderConfig` |
| `lib/demoContent.ts` | **NEW** – `generateDemoFaqs`, `generateDemoReviews` (extracted) |
| `lib/firestoreSites.ts` | Refactored `createSiteFromTemplate` to read from `templates/` |
| `lib/initializeUserSite.ts` | Now reads from `templates/hair1` instead of tenant site |
| `app/api/onboarding/complete/route.ts` | Merges template defaults, adds `businessType`, `templateKey` |
| `app/api/create-website/route.ts` | Merges template defaults, adds `businessType`, `templateKey` |
| `firestore.rules` | Added `templates` collection (public read, server-only write) |
| `package.json` | Added `create-hair1-template`, `migrate-sites-to-hair1` scripts |

## Scripts Added

| Script | Purpose |
|--------|---------|
| `scripts/createHair1TemplateFromSite.ts` | Export `sites/amitay-hair-mk6krumy` → `templates/hair1` |
| `scripts/migrateSitesToHair1.ts` | Update existing sites: `businessType`, `templateKey`, `templateSource` |
| `scripts/verifyTemplateRefactor.ts` | Smoke test: template exists, no runtime dependency on tenant site |

## Template Schema

**Path:** `templates/{templateKey}` (e.g. `templates/hair1`)

```typescript
{
  businessType: "hair",
  configDefaults: {
    themeColors?: { background, surface, primary, ... };
    heroImage?: string;
    aboutImage?: string;
    dividerStyle?: "none" | "wave" | "curve" | "angle";
    dividerHeight?: number;
    extraPages?: ("reviews" | "faq")[];
    vibe?: "clean" | "luxury" | "colorful" | "spa" | "surprise";
    photosOption?: "own" | "ai" | "mixed";
    contactOptions?: ("phone" | "whatsapp" | ...)[];
    mainGoals?: ("new_clients" | "online_booking" | ...)[];
  },
  displayName?: string,
  createdAt?: string,
  updatedAt?: string
}
```

Only website presentation fields. No bookings, clients, or tenant-specific data.

## Migration Instructions

1. **Create the hair1 template** (requires `sites/amitay-hair-mk6krumy` to exist):
   ```bash
   npm run create-hair1-template
   ```

2. **Migrate existing sites** (metadata only, no re-seeding):
   ```bash
   npm run migrate-sites-to-hair1          # dry run
   npm run migrate-sites-to-hair1 -- --execute
   ```

3. **Deploy** Firestore rules and app.

4. **Verify** – create a new site via onboarding and confirm it looks correct.

5. **Clean slate** – After migration, it is safe to delete `amitay-hair-mk6krumy`. No runtime code depends on it. The clean slate script protects sites by owner; if you want to delete amitay-hair, exclude it from protection or delete it manually.

## No Runtime Dependency on amitay-hair-mk6krumy

- `lib/firestoreSites.ts` – reads from `templates/`
- `lib/initializeUserSite.ts` – reads from `templates/`
- `app/api/onboarding/complete/route.ts` – uses `getTemplateConfigDefaults`
- `app/api/create-website/route.ts` – uses `getTemplateConfigDefaults`

The only remaining reference is in `scripts/createHair1TemplateFromSite.ts`, which intentionally reads from that site to export it. Run this script once before deleting the site.
