# Twilio WhatsApp integration (Caleno)

One WhatsApp sender number for the whole platform. Every message includes the salon name (e.g. "Avi Hair Salon ✂️") so customers know which business is messaging.

## Flow

1. **Booking created** (public or admin) → immediate confirmation WhatsApp:  
   `{SalonName} ✂️ Thanks for booking! Your appointment is {date} at {time}. We'll remind you 24 hours before.`
2. **Last-minute booking** (start time &lt; 24h from now): the same reminder/confirmation-request message is sent immediately after the confirmation (so the customer gets confirmation + “מגיע/ה? כן, אגיע / לא...” in one go). The cron will not send it again because `reminder24hSentAt` is set.
3. **24 hours before** (for bookings not already sent above) → reminder WhatsApp:  
   `{SalonName} ✂️ Reminder: your appointment is tomorrow at {time}. Reply YES to confirm.`
4. **Customer replies YES** (כן / yes / אגיע etc.) → booking `whatsappStatus: "confirmed"`, `confirmationReceivedAt` set; reply:  
   `אושר ✅ נתראה ב-{time} ב-{salonName}.`  
   UI shows booking as מאושר (green).
5. **Customer replies NO** (לא / no / בטל etc.) → booking is **cancelled** (not deleted):  
   `whatsappStatus: "cancelled"`, `status: "cancelled"`, `cancelledAt`, `archivedAt`, `archivedReason: "customer_cancelled_via_whatsapp"`.  
   Reply: `הבנתי, ביטלתי את התור.`  
   Booking is **removed from calendar** and **shown in client history** as בוטל (cancelled).

## Data model (Firestore)

- **sites/{siteId}**  
  - `config.salonName` (or `config.whatsappBrandName`) used in messages.

- **sites/{siteId}/bookings/{bookingId}**  
  - Existing fields plus WhatsApp-related:
  - `customerPhoneE164` (string, E.164) – set when confirmation is sent.
  - `whatsappStatus`: `"booked"` | `"awaiting_confirmation"` | `"confirmed"` | `"cancelled"`.
  - `confirmationRequestedAt` (Timestamp | null) – set when 24h reminder is sent (pending confirmation).
  - `reminder24hSentAt` (Timestamp | null) – set when 24h reminder is sent (idempotency; skip if already set).
  - `confirmationReceivedAt` (Timestamp | null) – set when user replies YES.
  - When user replies NO: `whatsappStatus: "cancelled"`, `status: "cancelled"`, `cancelledAt`, `archivedAt`, `archivedReason: "customer_cancelled_via_whatsapp"`. Document is **not** deleted; it is hidden from calendar and shown in client history as cancelled.

- **whatsapp_messages/{messageId}**  
  - `direction`: `"outbound"` | `"inbound"`.
  - `toPhone`, `fromPhone`, `body`, `bookingId`, `siteId`, `bookingRef` (path e.g. `sites/{siteId}/bookings/{bookingId}`), `twilioMessageSid`, `createdAt`, `error`.

- **whatsapp_inbound/{inboundId}** (top-level; production diagnostics)  
  - Written at webhook entry: `inboundId`, `receivedAt`, `from`, `to`, `body`, `messageSid`, `status: "received"`.  
  - Updated after processing: `status` one of `"matched_yes"` | `"matched_no"` | `"no_match"` | `"no_booking"` | `"ambiguous"` | `"signature_failed"` | `"error"`, optional `bookingRef`, `errorMessage`, `updatedAt`.  
  - Use to confirm production is receiving webhooks even if the UI doesn’t update (e.g. Vercel logs show `[WA_WEBHOOK] start` and a doc appears in **whatsapp_inbound**).

## Required env vars

In `.env.local` (and Vercel env for production):

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Yes | Sender, e.g. `whatsapp:+14155238886` (sandbox or prod) |
| `WEBHOOK_BASE_URL` | For ngrok | Base URL for signature validation (e.g. `https://abc.ngrok.io`) |
| `TWILIO_WEBHOOK_URL` | **Production** | **Exact** URL Twilio calls (e.g. `https://YOURDOMAIN.vercel.app/api/webhooks/twilio/whatsapp`). Use this for signature validation behind proxies; do not rely on `WEBHOOK_BASE_URL` in production. |
| `TWILIO_SIGNATURE_MODE` | Optional | `enforce` (default) or `log_only`. If `log_only`, signature failures are logged but not blocked (replies still work). Use **temporarily** to verify Twilio reaches the endpoint; switch back to `enforce` after fixing the URL. |
| `CRON_SECRET` | For cron | Bearer token for `POST /api/cron/send-whatsapp-reminders` |
| `SKIP_TWILIO_SIGNATURE` | DEV only | Set to `true` to skip webhook signature validation when `NODE_ENV !== "production"` (never use in production) |

## Ngrok steps (local testing)

1. Run the app: `npm run dev`.
2. Expose it: `ngrok http 3000`.
3. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`).
4. In `.env.local`:  
   `WEBHOOK_BASE_URL=https://abc123.ngrok.io`
5. **Twilio Sandbox webhook URL**:  
   In Twilio Console → Messaging → Try it out / Sandbox (or your WhatsApp sender):  
   - **When a message comes in**: `https://abc123.ngrok.io/api/webhooks/twilio/whatsapp`  
   - Method: **POST**.
6. Restart the dev server so it picks up `WEBHOOK_BASE_URL`.

Twilio sends webhooks to that URL. Signature validation uses the **raw request body** (read with `request.text()`), parsed via `URLSearchParams` into a params object; the handler uses Twilio’s `validateRequest(authToken, signature, url, params)` and does **not** use `request.formData()` for validation (to avoid altering encoding of Hebrew or other content). `WEBHOOK_BASE_URL` is used only when `TWILIO_WEBHOOK_URL` is not set. For local testing without ngrok signature issues, set `SKIP_TWILIO_SIGNATURE=true` in `.env.local` (dev only).

### Production webhook (critical)

**Twilio Console → Messaging → Try it out / Sandbox (or your WhatsApp sender):**

- **When a message comes in:** set to **exactly**  
  `https://YOURDOMAIN.vercel.app/api/webhooks/twilio/whatsapp`  
  (replace `YOURDOMAIN` with your Vercel project domain, e.g. `caleno-xxx`).
- **Method:** **POST**.

**Vercel env (required for signature validation behind proxy):** set  
`TWILIO_WEBHOOK_URL=https://YOURDOMAIN.vercel.app/api/webhooks/twilio/whatsapp`  
to the **exact** URL configured in Twilio Console. When set, the app uses this URL for signature validation and does **not** use `request.url` or `Host`/`x-forwarded-*` (so it works behind Vercel’s proxy). If you see `[WA_WEBHOOK] signature_failed` in logs, add or fix `TWILIO_WEBHOOK_URL` so it matches Twilio’s “When a message comes in” URL exactly. On signature failure the handler logs `inboundId`, `urlForSig`, `signatureHeaderLength`, `rawBodyLength`, and `paramKeys` (no secrets).

**Temporary debug when signature keeps failing:** set `TWILIO_SIGNATURE_MODE=log_only` in Vercel. The webhook will **not** block on signature failure; it will log `[WA_WEBHOOK] signature_debug` with `urlForSig`, `requestUrl`, `host`, `xForwardedHost`, `xForwardedProto`, and `twilioSignaturePresent`, and continue processing so replies work. Use this to confirm Twilio is reaching the endpoint and to compare the URL Twilio uses with `TWILIO_WEBHOOK_URL`. After you correct the Twilio webhook URL (or env) so they match, set `TWILIO_SIGNATURE_MODE=enforce` or remove the var (default is enforce) so signature validation is enforced again.

**Verify routing:** open **GET** `https://YOURDOMAIN.vercel.app/api/debug/whatsapp-webhook-health` in a browser. You should see `{ "ok": true, "now": "...", "webhook": "/api/webhooks/twilio/whatsapp" }`.

## Endpoints

- **POST /api/webhooks/twilio/whatsapp**  
  Inbound WhatsApp webhook. Validates `X-Twilio-Signature` (using `TWILIO_WEBHOOK_URL` or `x-forwarded-*` when behind a proxy), writes each inbound to Firestore **whatsapp_inbound** (status: received → matched_yes / matched_no / no_match / no_booking / ambiguous / signature_failed / error), handles YES/NO, and **always** returns TwiML `<Response><Message>...</Message></Response>` so WhatsApp receives a reply. Check Vercel logs for `[WA_WEBHOOK]` and Firestore **whatsapp_inbound** to confirm production receives webhooks.

- **GET /api/debug/whatsapp-webhook-health**  
  Returns `{ ok: true, now: ISO, webhook: "/api/webhooks/twilio/whatsapp" }`. Use to verify routing on Vercel.

- **POST /api/whatsapp/send-booking-confirmation**  
  Body: `{ "siteId": "...", "bookingId": "..." }`.  
  Sends the immediate confirmation message, sets `customerPhoneE164` and `whatsappStatus: "booked"` on the booking.  
  The public book page calls this after `saveBooking` succeeds.

- **GET/POST /api/cron/send-whatsapp-reminders** (used by Vercel Cron)  
  Protected by **Authorization: Bearer CRON_SECRET** or by Vercel cron User-Agent (`vercel-cron`).  
  Window: `startAt` in **[now+24h−30min, now+24h+30min)** so reminders are not missed if cron runs late/early.  
  Bookings with `whatsappStatus === "booked"` and no `reminder24hSentAt`. Idempotent.

- **POST /api/cron/whatsapp-reminders**  
  Same logic; protected by **?secret=CRON_SECRET** (query param only; no Authorization header). Use for external cron (e.g. cron-job.org). Every invocation is logged to Firestore `cron_runs` for observability.

- **POST /api/cron/debug-reminder**  
  Production-safe debug: pass `?secret=CRON_SECRET` and body `{ siteId, bookingId }`. Returns `nowIso`, `startAtIso`, `diffMinutesTo24h`, `whatsappStatus`, `reminder24hSentAtExists`, `wouldMatchWindow`. Use to verify why a booking did or didn’t get a reminder without waiting 24 hours.

- **POST /api/cron/test-whatsapp-reminder**  
  Debug: pass `{ bookingRef: "sites/SITE_ID/bookings/BOOKING_ID" }` or `{ siteId, bookingId }`. Returns `shouldSendReminder`, `withinWindow`, `diffHours`, etc. Use `forceSend: true` to send the reminder for that booking now (if in window). Protected by CRON_SECRET (query or Bearer).

**Callable after creating a booking (server-only):**

```ts
import { onBookingCreated } from "@/lib/onBookingCreated";
// After writing the booking doc to Firestore:
await onBookingCreated(siteId, bookingId);
```

## 24-hour reminder scheduler (Vercel)

### Window and timezone

- **Window:** Reminders are sent when the booking’s **startAt** is in **[now + 24h − 60min, now + 24h + 60min)** (2-hour window). The 60-minute tolerance prevents missing reminders when the external cron runs late or early (e.g. cron-job.org drift).
- **Timezone:** Firestore stores **startAt** as UTC. The server uses UTC for the window, so “24 hours before” is correct regardless of server location. Bookings are created in the client’s (Israel) time and stored as that instant in UTC.
- **Time field:** The system uses **startAt** (with fallback to **appointmentAt** when reading a single doc). Bookings under `sites/{siteId}/bookings/{bookingId}` use **startAt**.
- **Idempotent:** Each booking is updated with `reminder24hSentAt` when a reminder is sent; the cron never sends twice for the same booking.

### Using External Scheduler (cron-job.org)

Vercel Hobby plan does not include built-in Cron. Use an external scheduler (e.g. [cron-job.org](https://cron-job.org)) to trigger the reminder endpoint every 5 minutes.

**Exact cron-job.org settings:**

| Setting | Value |
|--------|--------|
| **URL** | `https://YOUR_DOMAIN/api/cron/whatsapp-reminders?secret=YOUR_CRON_SECRET` |
| **Method** | POST (do not use GET) |
| **Schedule** | Every 5 minutes (e.g. `*/5 * * * *`) |
| **Request timeout** | 60 seconds or more |

- **CRON_SECRET** must be set in Vercel → Project → Settings → Environment Variables (Production). Use the **exact same value** in the URL query when configuring the cron job.
- The route uses **only** the `secret` query parameter; it does **not** use `Authorization` headers (cron-job.org often cannot set custom headers).

**Trigger reminders manually:**

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/whatsapp-reminders?secret=YOUR_CRON_SECRET"
```

**Alternative (Bearer auth) for send-whatsapp-reminders:**

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/send-whatsapp-reminders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Confirming cron runs in production (cron_runs)

Every invocation of **POST /api/cron/whatsapp-reminders** writes a document to the Firestore collection **`cron_runs`** (top-level). Use this to verify the cron is being called and why reminders did or didn’t send.

1. Open [Firebase Console](https://console.firebase.google.com) → your project → Firestore.
2. Open the **cron_runs** collection (create it if it doesn’t exist; it is created on first write).
3. Each document contains: `ranAt`, `env`, `route`, `ok`, `auth`, `windowStartIso`, `windowEndIso`, `foundCount`, `sentCount`, `skippedCount`, `errorMessage`.

- **auth: "forbidden"** → cron-job.org URL has wrong or missing `?secret=`.
- **ok: false** and **errorMessage** set → check the message (e.g. missing env var, Firestore index required).
- **ok: true**, **foundCount: 0** → no bookings in the 24h window; timing is correct but no appointments.
- **ok: true**, **sentCount: 0**, **skippedCount: N** → bookings were in window but skipped (e.g. already had reminder, or no phone).

### Test without waiting (debug-reminder and test-whatsapp-reminder)

**Production-safe debug (no side effects):**

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/debug-reminder?secret=YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"siteId":"YOUR_SITE_ID","bookingId":"YOUR_BOOKING_ID"}'
```

Response: `nowIso`, `startAtIso`, `diffMinutesTo24h`, `whatsappStatus`, `reminder24hSentAtExists`, `wouldMatchWindow`, and the window bounds. Use this to see why a specific booking would or wouldn’t get a reminder.

**Optional force-send (test-whatsapp-reminder):**

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/test-whatsapp-reminder?secret=YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"siteId":"YOUR_SITE_ID","bookingId":"YOUR_BOOKING_ID"}'
```

Response includes `now`, `startAt`, `diffHours`, `withinWindow`, `reminder24hSentAtPresent`, `whatsappStatus`, `shouldSendReminder`, and the computed window. Add `"forceSend": true` to send the reminder for that booking now (only if `shouldSendReminder` is true).

### Common failure reasons (24h reminder not sent)

| Symptom | Cause | Fix |
|--------|--------|-----|
| **cron_runs** shows `auth: "forbidden"` | Wrong or missing `?secret=` in cron URL | Set `CRON_SECRET` in Vercel and use the same value in the URL: `?secret=YOUR_CRON_SECRET`. |
| **500** with "CRON_SECRET is missing" | Env var not set in Vercel | Add `CRON_SECRET` in Vercel → Settings → Environment Variables (Production). |
| **500** with "TWILIO_ACCOUNT_SID..." or "TWILIO_WHATSAPP_FROM..." | Twilio env vars missing in production | Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` in Vercel. |
| **500** with "Firebase Admin not available" / "FIREBASE_SERVICE_ACCOUNT_JSON" | Firebase Admin credentials missing | Add `FIREBASE_SERVICE_ACCOUNT_JSON` (or split vars) in Vercel. |
| **500** with "Firestore index required" | Composite index not deployed | Run `firebase deploy --only firestore:indexes`. Index needed: collection group `bookings`, fields `whatsappStatus` (ASC), `startAt` (ASC). |
| **ok: true** but **foundCount: 0** every time | No bookings in the 24h window, or query/index issue | Use **POST /api/cron/debug-reminder** with a real `siteId`/`bookingId` to see `diffMinutesTo24h` and `wouldMatchWindow`. |
| Reminders sent for some bookings but not others | Booking missing `customerPhoneE164`, or `whatsappStatus` not `"booked"`, or `reminder24hSentAt` already set | Check the booking doc in Firestore; confirm confirmation WhatsApp was sent so `whatsappStatus` is `"booked"`. |

### Firestore indexes for collectionGroup queries

Firestore **requires a composite index** for any collection group query that combines a range filter with other conditions. If the index is missing, the reminder cron returns `FAILED_PRECONDITION` (HTTP 500 with a hint in the response body).

**Deploy indexes:**

```bash
firebase deploy --only firestore:indexes
```

**Index required for the 24h reminder cron** (used in `lib/whatsapp/runReminders.ts`):

- **Collection group:** `bookings`
- **Fields (in this order):**
  - `whatsappStatus` (Ascending)
  - `startAt` (Ascending)
- Firestore may add `__name__` ordering automatically; if the deploy or console asks for it, include it.

The query is: `collectionGroup("bookings").where("startAt", ">=", ...).where("startAt", "<", ...).where("whatsappStatus", "==", "booked")`. The equality field (`whatsappStatus`) must come first in the composite index, then the range field (`startAt`).

**All required composite indexes** (defined in `firestore.indexes.json`):

- **Inbound YES/NO lookup:** `customerPhoneE164` (ASC), `whatsappStatus` (ASC), `startAt` (ASC).
- **24h reminder cron:** `whatsappStatus` (ASC), `startAt` (ASC).

Bookings are nested under `sites/{siteId}/bookings/{bookingId}`; collection group queries run across all sites.

### Last-minute bookings (start &lt; 24h from now)

When a booking is created with **startAt** less than 24 hours in the future (and in the future), `onBookingCreated` sends the confirmation WhatsApp and then **immediately** sends the same reminder/confirmation-request message (“מגיע/ה? כן, אגיע / לא...”). It then sets `reminder24hSentAt`, `confirmationRequestedAt`, and `whatsappStatus: "awaiting_confirmation"` so the cron will not send the reminder again. All times use server timestamps (UTC) for the 24h check; displayed times in messages use Asia/Jerusalem.

**Local verification:**

- **Booking 2 hours from now:** Customer should receive (1) confirmation and (2) reminder/confirmation-request within a short time. In Firestore: `whatsappStatus: "awaiting_confirmation"`, `reminder24hSentAt` and `confirmationRequestedAt` set. In `whatsapp_messages`, the reminder entry has `reminder_sent_immediately_due_to_last_minute_booking: true`.
- **Booking 30 hours from now:** Customer receives only the confirmation. Reminder is sent later by the cron when the booking enters the 24h window. In Firestore: `whatsappStatus: "booked"`, `reminder24hSentAt` null until cron runs.

### Manual testing

1. **Create a booking** (public book page or admin) so it has a customer phone. After creation, the app calls `/api/whatsapp/send-booking-confirmation` (which uses `onBookingCreated`), which sets `customerPhoneE164` and `whatsappStatus: "booked"`. If the booking starts within 24h, the reminder is also sent immediately and status becomes `"awaiting_confirmation"`.
2. **Trigger 24h reminder:** An external scheduler (e.g. cron-job.org) calls **POST /api/cron/whatsapp-reminders?secret=CRON_SECRET** every 5 minutes. For a booking whose **startAt** is in the next **[now+24h−60min, now+24h+60min)** window and still has `whatsappStatus === "booked"` and no `reminder24hSentAt`, the reminder is sent. Last-minute bookings already have `reminder24hSentAt` set, so the cron skips them. Confirm runs in production by checking the **cron_runs** collection in Firestore. To test without waiting, use **POST /api/cron/debug-reminder** with `{ siteId, bookingId }` to see if the booking would match, or **POST /api/cron/test-whatsapp-reminder** with `{ siteId, bookingId, forceSend: true }` to send now (booking must be in window and `whatsappStatus: "booked"`, no `reminder24hSentAt`).
3. **Reply YES** from the customer’s WhatsApp number. The webhook finds the single `awaiting_confirmation` booking for that phone, updates it to `whatsappStatus: "confirmed"` and `confirmationReceivedAt`, and replies in Hebrew.
4. **Reply NO** to cancel the same booking.
5. **Reply anything else** to get the help message.

## Multi-tenant correctness

- Every outbound message includes **salon name** and **time**.
- Inbound YES: we find the single booking with `customerPhoneE164` match, `whatsappStatus === "awaiting_confirmation"`, `startAt > now`, ordered by `startAt` asc (limit 2 to detect ambiguity). If exactly one, we confirm it and reply; otherwise we ask the user to clarify.
- NO: same lookup; we mark that booking cancelled and reply.

## Verification (YES/NO and UI)

- **Booking created** → `whatsappStatus: "booked"`.
- **Reminder sent** (cron or immediate for last-minute) → `whatsappStatus: "awaiting_confirmation"` (pending), `confirmationRequestedAt` and `reminder24hSentAt` set.
- **Reply "כן" (or yes / אגיע etc.)** → `whatsappStatus: "confirmed"`, `confirmationReceivedAt` set. UI shows the booking as מאושר (green).
- **Reply "לא" (or no / בטל etc.)** → `whatsappStatus: "cancelled"`, `cancelledAt`, `archivedAt`, `archivedReason: "customer_cancelled_via_whatsapp"` set. The booking is **removed from calendar/active views** (filtered by `isBookingCancelled` / `isBookingArchived`) and **visible in the client’s booking history** as בוטל (Cancelled). The Firestore document is **not** deleted.

## Security

- Webhook validates `X-Twilio-Signature` using Twilio’s `validateRequest(authToken, signature, url, params)`. The request body is read as **raw text** (`request.text()`), parsed with `URLSearchParams` into a params object (no `formData()`), so encoding (e.g. Hebrew) is not altered. The URL is **TWILIO_WEBHOOK_URL** if set, else derived from request. Body is only trimmed/normalized **after** validation for YES/NO matching.
- On signature failure the handler logs `[WA_WEBHOOK] signature_failed` with `inboundId`, `urlForSig`, `signatureHeaderLength`, `rawBodyLength`, `paramKeys`, writes **whatsapp_inbound** with `status: "signature_failed"`, and returns 403 with TwiML.
- Protect the reminder cron with `CRON_SECRET` if the route is publicly reachable.
