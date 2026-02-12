# Production fix – test plan

Quick checks after deploying the image 404 and React #310 fixes.

## Part 1 – Template images (404 fix)

1. **Local**
   - `npm run build && npm run start`
   - Open: `http://localhost:3000/templates/hair/work/work1.jpg` → image loads (200).
   - With tenant: `http://localhost:3000/?tenant=aviazulay` then open the same image URL on that “tenant” context (or hit `/templates/hair/work/work1.jpg` after loading the tenant) → 200.

2. **Production**
   - Root: `https://caleno.co/templates/hair/work/work1.jpg` → 200.
   - Tenant: `https://<tenant>.caleno.co/templates/hair/work/work1.jpg` (e.g. `aviazulay.caleno.co`) → 200.
   - Same for hero/about: `.../templates/hair/hero/hero1.jpg`, `.../templates/hair/about/about1.jpg`.

## Part 2 – Bookings page (React #310 fix)

1. **Local production build**
   - `npm run build && npm run start`
   - Open the public booking page (e.g. `http://localhost:3000/site/<siteId>/book` or via tenant subdomain).
   - Go through steps (service → worker → date → time → details) without crash.
   - Console: no “Minified React error #310” or hook-order errors.

2. **Production**
   - Open the same bookings page on prod (root or tenant).
   - Confirm page loads and no React errors in console.

## Final checklist

- [ ] `npm run build` passes
- [ ] `npm run start` → open bookings page → no crash
- [ ] `/templates/hair/work/work1.jpg` returns 200 on root and tenant
- [ ] Prod: bookings page works and console is clean
