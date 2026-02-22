# Security Overview Implementation

## 1. Admin AI Route (`app/api/admin-ai/route.ts`)

### Validation Logic
- **requireAuth(request)**: Extracts `Authorization: Bearer <token>`, verifies with firebase-admin, returns `uid`.
- **assertSiteOwner(uid, siteId)**: Loads `sites/{siteId}`, checks `ownerUid` or `ownerUserId` === `uid`.
- Ownership is asserted **before** any site data is read or written.

### Response Codes
| Code | Condition |
|------|-----------|
| 400 | Missing/invalid siteId or messages |
| 401 | No token or invalid/expired token |
| 403 | User does not own the site |
| 500 | Server error |

---

## 2. Send Booking Confirmation – Admin Path (`app/api/whatsapp/send-booking-confirmation/route.ts`)

### Validation Logic
1. **requireAuth** → 401 if no/invalid token
2. Parse `siteId`, `bookingId` from body
3. Load booking at `sites/{siteId}/bookings/{bookingId}`
4. Derive `resolvedSiteId` from booking (`data.siteId ?? siteId`)
5. Validate `data.siteId === siteId` when `data.siteId` exists
6. **assertSiteOwner(uid, resolvedSiteId)** → 403 if not owner
7. Rate limit per `(siteId, bookingId)` → 429
8. Check `confirmationSentAt == null` → 409 if already sent
9. **Transaction**: Read booking, if `confirmationSentAt` set throw CONFLICT; else set `confirmationSentAt`
10. Call `onBookingCreated`

### Response Codes
| Code | Condition |
|------|-----------|
| 400 | Missing siteId/bookingId or siteId does not match booking |
| 401 | No/invalid token |
| 403 | User does not own site |
| 404 | Booking not found |
| 409 | Confirmation already sent (`confirmationSentAt` set) |
| 429 | Rate limited |
| 500 | Server error |

---

## 3. Confirm After Create – Public Path (`app/api/bookings/confirm-after-create/route.ts`)

### Validation Logic
1. Parse `siteId`, `bookingId` from body
2. **Rate limits** (Firestore in prod, in-memory in dev):
   - Per IP: 20 / 10 min
   - Per booking: 2 / 10 min
   - Per site: 50 / 10 min
3. Load booking at `sites/{siteId}/bookings/{bookingId}`
4. Validate `data.siteId === siteId`
5. Validate `createdAt` ≤ 2 minutes ago
6. Validate `confirmationSentAt == null`
7. Validate status in `["booked","pending","confirmed"]`
8. **Transaction**: If `confirmationSentAt` set → throw; else set `confirmationSentAt`
9. Call `onBookingCreated`

### Response Codes
| Code | Condition |
|------|-----------|
| 400 | Missing siteId/bookingId |
| 403 | Booking too old, already confirmed, wrong site, invalid status |
| 404 | Booking not found |
| 429 | Rate limited (IP, booking, or site) |
| 500 | Server error |

---

## 4. Shared Server Helpers

### `lib/server/requireAuth.ts`
- Reads `Authorization: Bearer <token>`
- Verifies token with firebase-admin
- Returns `{ uid }` or 401 `NextResponse`

### `lib/server/assertSiteOwner.ts`
- Loads `sites/{siteId}`
- Checks `ownerUid === uid` or `ownerUserId === uid`
- Returns `null` or 403/404 `NextResponse`

### `lib/server/rateLimit.ts`
- **Development**: In-memory `Map` (resets on restart)
- **Production**: Firestore `rateLimits` collection with TTL fields
- `getClientIp(request)`: Uses `x-forwarded-for`, `x-real-ip`
- `checkRateLimit(key, limit, windowMs)`: Returns `{ allowed, retryAfterMs }`

---

## 5. Firestore Model

### Booking
- `siteId`: string
- `createdAt`: timestamp
- `confirmationSentAt`: timestamp (set when confirmation WhatsApp sent)

### `lib/onBookingCreated.ts`
- Checks `confirmationSentAt != null` before sending (idempotent)
- Sets `confirmationSentAt` on successful send

---

## 6. Client Updates

- **Admin calls**: `auth.currentUser.getIdToken()` → `Authorization: Bearer ${token}` (e.g. AIFloatingWidget)
- **Public flow**: Calls `/api/bookings/confirm-after-create` without token

---

## 7. Modified Files

| File | Changes |
|------|---------|
| `lib/server/requireAuth.ts` | Created – token verification |
| `lib/server/assertSiteOwner.ts` | Created – ownership check |
| `lib/server/rateLimit.ts` | Created – Firestore + in-memory rate limiting |
| `app/api/admin-ai/route.ts` | Added requireAuth + assertSiteOwner before any access |
| `app/api/whatsapp/send-booking-confirmation/route.ts` | Auth required, derive siteId from booking, atomic tx, rate limit |
| `app/api/bookings/confirm-after-create/route.ts` | 2-min recency, per-IP/booking/site rate limits, atomic tx |
| `lib/onBookingCreated.ts` | Added confirmationSentAt check and write |
| `components/admin/AIFloatingWidget.tsx` | Passes idToken in Authorization header |
| `app/(site)/site/[siteId]/book/page.tsx` | Calls confirm-after-create (no token) |
| `firestore.rules` | Added rateLimits collection (server-only) |

---

## 8. Multi-Tenant Isolation

- **Admin routes**: Always verify ownership before using siteId
- **Public route**: Cannot spam – rate limits, 2-min window, atomic transaction on `confirmationSentAt`
- No tenant leakage: ownership checked on every authenticated request
