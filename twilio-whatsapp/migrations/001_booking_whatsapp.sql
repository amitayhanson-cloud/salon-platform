-- Twilio WhatsApp integration: booking status + E164 phone + confirmation timestamps
-- Run against your PostgreSQL database.

-- Booking status enum for WhatsApp confirmation flow
DO $$ BEGIN
  CREATE TYPE booking_whatsapp_status AS ENUM (
    'booked',
    'awaiting_confirmation',
    'confirmed',
    'cancelled',
    'no_show'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add columns to bookings (adjust table name if yours differs, e.g. "bookings")
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS customer_phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS status_whatsapp booking_whatsapp_status DEFAULT 'booked',
  ADD COLUMN IF NOT EXISTS confirmation_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_received_at TIMESTAMPTZ;

-- Index for finding "next upcoming booking awaiting confirmation" by phone
CREATE INDEX IF NOT EXISTS idx_bookings_customer_phone_e164
  ON bookings (customer_phone_e164);

CREATE INDEX IF NOT EXISTS idx_bookings_status_appointment
  ON bookings (status_whatsapp, appointment_time)
  WHERE status_whatsapp = 'awaiting_confirmation';

-- Optional: if your bookings table uses a different primary key or has appointment_time
-- ensure appointment_time exists (timestamptz recommended)
-- ALTER TABLE bookings ADD COLUMN IF NOT EXISTS appointment_time TIMESTAMPTZ;

COMMENT ON COLUMN bookings.customer_phone_e164 IS 'E.164 format for Twilio WhatsApp';
COMMENT ON COLUMN bookings.status_whatsapp IS 'Flow: booked -> (reminder) -> awaiting_confirmation -> (YES) -> confirmed';
