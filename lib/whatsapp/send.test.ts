/**
 * Unit tests for sendWhatsApp (including global kill-switch).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const twilioCreateMock = vi.hoisted(() => vi.fn().mockResolvedValue({ sid: "SMtest123" }));
const firestoreAddMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "log1" }));

vi.mock("twilio", () => ({
  default: vi.fn(() => ({
    messages: {
      create: (...args: unknown[]) => twilioCreateMock(...args),
    },
  })),
}));

vi.mock("@/lib/platformSettings", () => ({
  isWhatsAppAutomationEnabled: vi.fn(),
}));
vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));
vi.mock("./usage", () => ({
  assertSiteWithinWhatsAppLimit: vi.fn().mockResolvedValue({ allowed: true }),
  incrementWhatsAppUsage: vi.fn().mockResolvedValue(undefined),
  resolveOutboundUsageCategory: vi.fn().mockResolvedValue("utility"),
}));
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWhatsAppAutomationEnabled } from "@/lib/platformSettings";
import { sendWhatsApp } from "./send";

describe("sendWhatsApp", () => {
  const env = process.env;

  beforeEach(() => {
    vi.mocked(isWhatsAppAutomationEnabled).mockReset();
    twilioCreateMock.mockClear();
    firestoreAddMock.mockClear();
    vi.mocked(getAdminDb).mockReturnValue({
      collection: vi.fn((name: string) => {
        if (name === "sites") {
          return {
            doc: vi.fn(() => ({
              collection: vi.fn(() => ({ add: firestoreAddMock })),
            })),
          };
        }
        return { add: firestoreAddMock };
      }),
    } as unknown as ReturnType<typeof getAdminDb>);
    process.env = {
      ...env,
      TWILIO_ACCOUNT_SID: "ACtest",
      TWILIO_AUTH_TOKEN: "test-token",
      TWILIO_MESSAGING_SERVICE_SID: "MGtest123",
      TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
      TWILIO_TEMPLATE_BOOKING_CONFIRMED_CONTENT_SID: "HXbooking",
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
    expect(firestoreAddMock).not.toHaveBeenCalled();
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
    expect(firestoreAddMock).not.toHaveBeenCalled();
  });

  it("calls Twilio when bypassAutomationKillSwitch is true even if platform automations are off", async () => {
    vi.mocked(isWhatsAppAutomationEnabled).mockResolvedValue(false);

    const result = await sendWhatsApp({
      toE164: "+972501234567",
      body: "Broadcast",
      siteId: "site1",
      template: {
        name: "booking_confirmed",
        variables: { "1": "לקוח", "2": "עסק", "3": "01.01.2026", "4": "10:00" },
      },
      bypassAutomationKillSwitch: true,
      meta: { automation: "owner_broadcast" },
    });

    expect(result).toEqual({ sid: "SMtest123" });
    expect(twilioCreateMock).toHaveBeenCalledTimes(1);
    expect(isWhatsAppAutomationEnabled).toHaveBeenCalledTimes(0);
    expect(firestoreAddMock).toHaveBeenCalledTimes(2);
  });

  it("maps message body when sandbox mode is enabled", async () => {
    vi.mocked(isWhatsAppAutomationEnabled).mockResolvedValue(true);
    process.env.TWILIO_WHATSAPP_SANDBOX_MODE = "true";

    await sendWhatsApp({
      toE164: "+972501234567",
      body: "היי בדיקה",
      siteId: "site1",
      template: {
        name: "booking_confirmed",
        variables: { "1": "לקוח", "2": "עסק", "3": "01.01.2026", "4": "10:00" },
      },
      meta: { automation: "owner_broadcast" },
    });

    expect(twilioCreateMock).toHaveBeenCalledTimes(1);
    expect(firestoreAddMock).toHaveBeenCalledTimes(2);
    const arg = twilioCreateMock.mock.calls[0]?.[0] as {
      contentSid?: string;
      contentVariables?: string;
      body?: string;
      from?: string;
      messagingServiceSid?: string;
      to?: string;
    };
    expect(arg.contentSid).toBe("HXbooking");
    expect(typeof arg.contentVariables).toBe("string");
    expect(arg.body).toBeUndefined();
    expect(arg.from).toBeUndefined();
    expect(arg.messagingServiceSid).toBe("MGtest123");
    expect(arg.to).toBe("whatsapp:+972501234567");
    expect(arg.contentVariables).toBe(
      JSON.stringify({ "1": "לקוח", "2": "עסק", "3": "01.01.2026", "4": "10:00" })
    );
  });
});
