# Twilio WhatsApp integration (Caleno)

One WhatsApp sender number for the whole platform. Every message includes the salon name (e.g. "Avi Hair Salon ✂️") so customers know which business is messaging.

## Flow

1. **Booking created** (public or admin) → immediate confirmation WhatsApp:  
   `{SalonName} ✂️ Thanks for booking! Your appointment is {date} at {time}. We'll remind you 24 hours before.`
2. **24 hours before** → reminder WhatsApp:  
   `{SalonName} ✂️ Reminder: your appointment is tomorrow at {time}. Reply YES to confirm.`
3. **Customer replies YES** → booking marked confirmed, reply:  
   `{SalonName} ✂️ Confirmed ✅ See you at {time}.`
4. **Customer replies NO** → booking cancelled, reply with cancellation message.

## Data model (Firestore)

- **sites/{siteId}**  
  - `config.salonName` (or `config.whatsappBrandName`) used in messages.

- **sites/{siteId}/bookings/{bookingId}**  
  - Existing fields plus WhatsApp-related:
  - `customerPhoneE164` (string, E.164) – set when confirmation is sent.
  - `whatsappStatus`: `"booked"` | `"awaiting_confirmation"` | `"confirmed"` | `"cancelled"`.
  - `confirmationRequestedAt` (Timestamp | null) – set when 24h reminder is sent.
  - `reminder24hSentAt` (Timestamp | null) – set when 24h reminder is sent (idempotency; skip if already set).
  - `confirmationReceivedAt` (Timestamp | null) – set when user replies YES.

- **whatsapp_messages/{messageId}**  
  - `direction`: `"outbound"` | `"inbound"`.
  - `toPhone`, `fromPhone`, `body`, `bookingId`, `siteId`, `bookingRef` (path e.g. `sites/{siteId}/bookings/{bookingId}`), `twilioMessageSid`, `createdAt`, `error`.

## Required env vars

In `.env.local` (and Vercel env for production):

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Yes | Sender, e.g. `whatsapp:+14155238886` (sandbox or prod) |
| `WEBHOOK_BASE_URL` | For ngrok | Base URL for signature validation (e.g. `https://abc.ngrok.io`) |
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

Twilio sends webhooks to that URL. Signature validation uses the full URL + raw body; `WEBHOOK_BASE_URL` ensures the signed URL matches when behind ngrok. For local testing without ngrok signature issues, set `SKIP_TWILIO_SIGNATURE=true` in `.env.local` (dev only).

## Endpoints

- **POST /api/webhooks/twilio/whatsapp**  
  Inbound WhatsApp webhook. Validates `X-Twilio-Signature`, logs to `whatsapp_messages`, handles YES/NO. Replies are sent via the Twilio API and logged.

- **POST /api/whatsapp/send-booking-confirmation**  
  Body: `{ "siteId": "...", "bookingId": "..." }`.  
  Sends the immediate confirmation message, sets `customerPhoneE164` and `whatsappStatus: "booked"` on the booking.  
  The public book page calls this after `saveBooking` succeeds.

- **GET/POST /api/cron/send-whatsapp-reminders** (used by Vercel Cron)  
  Protected by **Authorization: Bearer CRON_SECRET** or by Vercel cron User-Agent (`vercel-cron`).  
  Window: `startAt` in **[now+24h−30min, now+24h+30min)** so reminders are not missed if cron runs late/early.  
  Bookings with `whatsappStatus === "booked"` and no `reminder24hSentAt`. Idempotent.

- **GET/POST /api/cron/whatsapp-reminders**  
  Same logic; protected by **?secret=CRON_SECRET**. Use for external cron (e.g. cron-job.org) when you cannot send headers.

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

- **Window:** Reminders are sent when the booking’s **startAt** is in **[now + 24h − 30min, now + 24h + 30min)** (1-hour window). This avoids missing reminders when the cron runs a few minutes late or early.
- **Timezone:** Firestore stores **startAt** as UTC. The server uses UTC for the window, so “24 hours before” is correct regardless of server location. Bookings are created in the client’s (Israel) time and stored as that instant in UTC.
- **Time field:** The system uses **startAt** (with fallback to **appointmentAt** when reading a single doc). Bookings under `sites/{siteId}/bookings/{bookingId}` use **startAt**.
- **Idempotent:** Each booking is updated with `reminder24hSentAt` when a reminder is sent; the cron never sends twice for the same booking.

### Using External Scheduler (cron-job.org)

Vercel Hobby plan does not include built-in Cron. Use an external scheduler (e.g. [cron-job.org](https://cron-job.org)) to trigger the reminder endpoint every 5 minutes.

- **Endpoint URL:**  
  `https://YOUR_DOMAIN/api/cron/whatsapp-reminders?secret=CRON_SECRET`
- **Method:** POST
- **Frequency:** every 5 minutes (e.g. `*/5 * * * *`)
- **CRON_SECRET** must be set in Vercel Environment Variables; use the same value in the URL when configuring the cron job.

The route accepts only POST. It checks the `secret` query parameter against `process.env.CRON_SECRET`. If they do not match, it returns `403` with `{ "error": "Forbidden" }`.

**Trigger reminders manually:**

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/whatsapp-reminders?secret=YOUR_CRON_SECRET"
```

**Alternative (Bearer auth) for send-whatsapp-reminders:**

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/send-whatsapp-reminders" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Test without waiting (debug endpoint)

To see why a booking did or didn’t get a reminder, and optionally force-send:

```bash
curl -X POST "https://your-domain.vercel.app/api/cron/test-whatsapp-reminder" \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"siteId":"YOUR_SITE_ID","bookingId":"YOUR_BOOKING_ID"}'
```

Response includes `now`, `startAt`, `diffHours`, `withinWindow`, `reminder24hSentAtPresent`, `whatsappStatus`, `shouldSendReminder`, and the computed window. Add `"forceSend": true` to send the reminder for that booking now (only if `shouldSendReminder` is true).

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

### Manual testing

1. **Create a booking** (public book page or admin) so it has a customer phone. After creation, the app calls `/api/whatsapp/send-booking-confirmation`, which sets `customerPhoneE164` and `whatsappStatus: "booked"`.
2. **Trigger 24h reminder:** An external scheduler (e.g. cron-job.org) calls **POST /api/cron/whatsapp-reminders?secret=CRON_SECRET** every 5 minutes. For a booking whose **startAt** is in the next **[now+24h−30min, now+24h+30min)** window, the reminder is sent. To test without waiting, use **POST /api/cron/test-whatsapp-reminder** with `{ siteId, bookingId, forceSend: true }` (booking must be in window and `whatsappStatus: "booked"`, no `reminder24hSentAt`).
3. **Reply YES** from the customer’s WhatsApp number. The webhook finds the single `awaiting_confirmation` booking for that phone, updates it to `whatsappStatus: "confirmed"` and `confirmationReceivedAt`, and replies in Hebrew.
4. **Reply NO** to cancel the same booking.
5. **Reply anything else** to get the help message.

## Multi-tenant correctness

- Every outbound message includes **salon name** and **time**.
- Inbound YES: we find the single booking with `customerPhoneE164` match, `whatsappStatus === "awaiting_confirmation"`, `startAt > now`, ordered by `startAt` asc (limit 2 to detect ambiguity). If exactly one, we confirm it and reply; otherwise we ask the user to clarify.
- NO: same lookup; we mark that booking cancelled and reply.

## Security

- Webhook validates `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN` and the **raw POST body** (Next.js route reads body with `request.text()` before parsing).
- Protect the reminder cron with `CRON_SECRET` if the route is publicly reachable.
