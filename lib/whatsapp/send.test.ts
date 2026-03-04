/**
 * Unit tests for sendWhatsApp (including global kill-switch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/platformSettings", () => ({
  isWhatsAppAutomationEnabled: vi.fn(),
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));
import { isWhatsAppAutomationEnabled } from "@/lib/platformSettings";
import { sendWhatsApp } from "./send";

describe("sendWhatsApp", () => {
  const env = process.env;

  beforeEach(() => {
    vi.mocked(isWhatsAppAutomationEnabled).mockReset();
    process.env = {
      ...env,
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "test-token",
      TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
    };
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns skipped sid when global kill-switch is disabled", async () => {
    vi.mocked(isWhatsAppAutomationEnabled).mockResolvedValue(false);

    const result = await sendWhatsApp({
      toE164: "+972501234567",
      body: "Test",
      siteId: "site1",
      bookingId: "booking1",
    });

    expect(result).toEqual({ sid: "skipped-global-disabled" });
    expect(isWhatsAppAutomationEnabled).toHaveBeenCalledTimes(1);
  });

  it("accepts meta.automation when kill-switch is disabled", async () => {
    vi.mocked(isWhatsAppAutomationEnabled).mockResolvedValue(false);

    const result = await sendWhatsApp({
      toE164: "+972501234567",
      body: "Reminder",
      siteId: "site1",
      bookingId: "b1",
      meta: { automation: "reminder_24h" },
    });

    expect(result).toEqual({ sid: "skipped-global-disabled" });
  });
});
