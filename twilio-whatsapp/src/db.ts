/**
 * PostgreSQL client for Twilio WhatsApp service.
 * Uses env: DATABASE_URL (e.g. postgresql://user:pass@localhost:5432/caleno)
 */

import { Pool, PoolClient } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://localhost:5432/caleno?sslmode=disable";

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export type BookingWhatsAppStatus =
  | "booked"
  | "awaiting_confirmation"
  | "confirmed"
  | "cancelled"
  | "no_show";
