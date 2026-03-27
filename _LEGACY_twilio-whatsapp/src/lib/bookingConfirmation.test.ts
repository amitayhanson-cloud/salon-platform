/**
 * Tests for mapping logic: finding the single "next upcoming booking awaiting confirmation"
 * by phone number (multi-tenant correctness).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { pool } from "../db";
import { findNextAwaitingConfirmationByPhone } from "./bookingConfirmation";

vi.mock("../db", () => ({
  pool: { query: vi.fn() },
}));

describe("findNextAwaitingConfirmationByPhone", () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it("returns null for empty phone", async () => {
    const result = await findNextAwaitingConfirmationByPhone("");
    expect(result).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("returns the single booking when exactly one matches", async () => {
    const row = {
      id: "bk-1",
      salon_id: "salon-1",
      salon_name: "Avi Hair Salon",
      appointment_time: new Date("2025-12-01T10:00:00Z"),
      customer_phone_e164: "+972501234567",
    };
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

    const result = await findNextAwaitingConfirmationByPhone("+972501234567");
    expect(result).toEqual(row);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("awaiting_confirmation"),
      ["+972501234567"]
    );
  });

  it("returns null when zero matches (no booking)", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const result = await findNextAwaitingConfirmationByPhone("+972501234567");
    expect(result).toBeNull();
  });

  it("returns null when two or more match (ambiguity)", async () => {
    const rows = [
      {
        id: "bk-1",
        salon_id: "salon-1",
        salon_name: "Salon A",
        appointment_time: new Date(),
        customer_phone_e164: "+972501234567",
      },
      {
        id: "bk-2",
        salon_id: "salon-2",
        salon_name: "Salon B",
        appointment_time: new Date(),
        customer_phone_e164: "+972501234567",
      },
    ];
    vi.mocked(pool.query).mockResolvedValueOnce({ rows, rowCount: 2 } as any);

    const result = await findNextAwaitingConfirmationByPhone("+972501234567");
    expect(result).toBeNull();
  });
});
