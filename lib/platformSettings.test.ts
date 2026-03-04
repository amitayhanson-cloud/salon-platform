/**
 * Unit tests for platform settings (WhatsApp automations kill-switch).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/firebaseAdmin", () => ({
  getAdminDb: vi.fn(),
}));

import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isWhatsAppAutomationEnabled,
  invalidateWhatsAppAutomationCache,
  getPlatformSettings,
} from "./platformSettings";

function mockDoc(snapData: { exists: boolean; data?: Record<string, unknown> }) {
  return {
    get: vi.fn().mockResolvedValue({
      exists: snapData.exists,
      data: () => snapData.data,
    }),
  };
}

function mockDb(snapData: { exists: boolean; data?: Record<string, unknown> }) {
  const doc = mockDoc(snapData);
  return {
    collection: vi.fn().mockReturnValue({
      doc: vi.fn().mockReturnValue(doc),
    }),
  };
}

describe("platformSettings", () => {
  beforeEach(() => {
    vi.mocked(getAdminDb).mockReset();
    invalidateWhatsAppAutomationCache();
  });

  describe("isWhatsAppAutomationEnabled", () => {
    it("returns true when doc has whatsappAutomationsEnabled: true", async () => {
      const db = mockDb({
        exists: true,
        data: { whatsappAutomationsEnabled: true },
      });
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const result = await isWhatsAppAutomationEnabled();
      expect(result).toBe(true);
    });

    it("returns false when doc has whatsappAutomationsEnabled: false", async () => {
      const db = mockDb({
        exists: true,
        data: { whatsappAutomationsEnabled: false },
      });
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const result = await isWhatsAppAutomationEnabled();
      expect(result).toBe(false);
    });

    it("returns true when doc is missing (default)", async () => {
      const db = mockDb({ exists: false });
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const result = await isWhatsAppAutomationEnabled();
      expect(result).toBe(true);
    });

    it("returns true when doc exists but field is not boolean (default)", async () => {
      const db = mockDb({
        exists: true,
        data: { whatsappAutomationsEnabled: "yes" },
      });
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const result = await isWhatsAppAutomationEnabled();
      expect(result).toBe(true);
    });

    it("uses cache within TTL", async () => {
      const doc = mockDoc({ exists: true, data: { whatsappAutomationsEnabled: false } });
      const collection = { doc: vi.fn().mockReturnValue(doc) };
      const db = { collection: vi.fn().mockReturnValue(collection) };
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const r1 = await isWhatsAppAutomationEnabled();
      const r2 = await isWhatsAppAutomationEnabled();
      expect(r1).toBe(false);
      expect(r2).toBe(false);
      expect(doc.get).toHaveBeenCalledTimes(1);
    });

    it("returns true and does not throw when get() throws", async () => {
      const doc = { get: vi.fn().mockRejectedValue(new Error("firestore error")) };
      const db = { collection: vi.fn().mockReturnValue({ doc: vi.fn().mockReturnValue(doc) }) };
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const result = await isWhatsAppAutomationEnabled();
      expect(result).toBe(true);
    });
  });

  describe("getPlatformSettings", () => {
    it("returns defaults when doc missing", async () => {
      const db = mockDb({ exists: false });
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const settings = await getPlatformSettings();
      expect(settings.whatsappAutomationsEnabled).toBe(true);
      expect(settings.updatedAt).toBeDefined();
      expect(settings.updatedBy).toBeNull();
    });

    it("returns doc data when doc exists", async () => {
      const db = mockDb({
        exists: true,
        data: {
          whatsappAutomationsEnabled: false,
          updatedBy: "admin@test.com",
          updatedAt: { toDate: () => new Date() },
        },
      });
      vi.mocked(getAdminDb).mockReturnValue(db as never);

      const settings = await getPlatformSettings();
      expect(settings.whatsappAutomationsEnabled).toBe(false);
      expect(settings.updatedBy).toBe("admin@test.com");
    });
  });
});
