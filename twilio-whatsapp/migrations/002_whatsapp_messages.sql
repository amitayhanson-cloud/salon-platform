-- Log all outbound and inbound WhatsApp messages for debugging and idempotency

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  to_phone TEXT NOT NULL,
  from_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  booking_id UUID NULL REFERENCES bookings(id) ON DELETE SET NULL,
  salon_id UUID NULL,
  twilio_message_sid TEXT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'received')),
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_booking_id ON whatsapp_messages (booking_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_from_phone ON whatsapp_messages (from_phone);

COMMENT ON TABLE whatsapp_messages IS 'All Twilio WhatsApp messages; used for logging and idempotency';
