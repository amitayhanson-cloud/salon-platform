# Twilio WhatsApp integration (Caleno)

One WhatsApp sender number for the whole platform. Messages include salon name (e.g. "Avi Hair Salon ✂️") so customers know which business is messaging.

## Features

1. **Booking confirmation** — sent immediately when a booking is created.
2. **24-hour reminder** — sent 24h before appointment; asks user to reply **YES** to confirm or **NO** to cancel.
3. **Inbound webhook** — handles YES/NO replies and maps them to the correct booking (multi-tenant safe).

## Stack

- Node.js + Express (TypeScript)
- PostgreSQL (bookings + salons + `whatsapp_messages` table)
- Twilio WhatsApp API

## Setup

### 1. Database

Ensure you have a `bookings` table with at least:

- `id` (UUID primary key)
- `salon_id` (UUID, references salons)
- `appointment_time` (TIMESTAMPTZ)
- Optional: `customer_phone` (we store E.164 in `customer_phone_e164`)

And a `salons` table with `id`, `name`.

Run migrations in order:

```bash
psql $DATABASE_URL -f migrations/001_booking_whatsapp.sql
psql $DATABASE_URL -f migrations/002_whatsapp_messages.sql
```

If your `bookings` table uses a different primary key type (e.g. bigint), edit `migrations/002_whatsapp_messages.sql` so `booking_id` matches.

### 2. Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL` — PostgreSQL connection string
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` — e.g. `whatsapp:+14155238886` (sandbox) or your prod number
- `WEBHOOK_BASE_URL` — full URL of this server (see Local dev below)

### 3. Install and run

```bash
npm install
npm run dev
```

Server listens on `PORT` (default 3001). Webhook: `POST /webhooks/twilio/whatsapp`.

## Local development (ngrok)

1. Start the server: `npm run dev`
2. Expose it with ngrok: `ngrok http 3001`
3. Copy the HTTPS URL (e.g. `https://abc123.ngrok.io`)
4. In `.env` set: `WEBHOOK_BASE_URL=https://abc123.ngrok.io`
5. In Twilio Console → Messaging → Try it out / Sandbox (or your WhatsApp sender):
   - **When a message comes in**: `https://abc123.ngrok.io/webhooks/twilio/whatsapp`  
   - Method: POST
6. Restart the server so it picks up the new `WEBHOOK_BASE_URL`

Twilio will send webhooks to that URL. Signature validation uses `WEBHOOK_BASE_URL` so the signed URL matches.

## Booking creation integration

When your app creates a booking (in PostgreSQL), call:

```ts
import { onBookingCreated } from "./bookingIntegration";

await onBookingCreated({
  bookingId: "...",
  salonId: "...",
  salonName: "Avi Hair Salon",
  customerPhone: "050-1234567",  // will be normalized to E.164
  appointmentTime: new Date("2025-12-01T10:00:00Z"),
});
```

This updates `customer_phone_e164` and `status_whatsapp = 'booked'`, and sends the confirmation WhatsApp.

## 24-hour reminder job

**Option A — cron every minute (recommended):**

```bash
* * * * * cd /path/to/twilio-whatsapp && npm run job:reminders
```

**Option B — HTTP cron (e.g. Vercel Cron or cron-job.org):**

```bash
POST https://your-server/cron/reminders?secret=YOUR_CRON_SECRET
```

Set `CRON_SECRET` in `.env`. The job finds bookings with `appointment_time` in 24h–24h+5min, sends the reminder, and sets `status_whatsapp = 'awaiting_confirmation'` and `confirmation_requested_at = now()`. Idempotent: won’t send twice for the same booking.

## Multi-tenant correctness

- Every outbound message includes **salon name** and **time**.
- Inbound **YES**: we find the single booking with `status_whatsapp = 'awaiting_confirmation'`, `appointment_time > now()`, and matching `customer_phone_e164`, ordered by `appointment_time ASC` and take the first. If there’s exactly one, we set it to `confirmed` and reply. If zero or multiple, we ask the user to clarify.
- **NO**: same lookup; we set that booking to `cancelled` and reply.

## Tests

```bash
npm test
```

Runs mapping logic tests (finding the correct booking by phone).

## Security

- Webhook validates `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN`. Never skip this in production.
- Protect `/cron/reminders` with `CRON_SECRET` if exposed to the internet.
