import { describe, it, expect } from "vitest";
import { renderWhatsAppTemplate, reminderTemplateHasRequiredTime } from "./templateRender";

/** Same shape as DEFAULT_CONFIRMATION_TEMPLATE (avoid @/ alias in vitest import graph). */
const CONFIRMATION_LIKE =
  "היי {client_name}, התור שלך ב-{business_name} נקבע ל-{time}. {custom_text}";

describe("renderWhatsAppTemplate", () => {
  it("fills known placeholders", () => {
    expect(
      renderWhatsAppTemplate("היי {client_name} ב-{business_name}", {
        client_name: "דנה",
        business_name: "סלון",
      })
    ).toBe("היי דנה ב-סלון");
  });

  it("removes empty custom_text and preceding space (default confirmation shape)", () => {
    const out = renderWhatsAppTemplate(CONFIRMATION_LIKE, {
      client_name: "דנה",
      business_name: "סלון",
      time: "10:00",
      custom_text: "",
    });
    expect(out).not.toContain("{custom_text}");
    expect(out).toMatch(/נקבע ל-10:00\.$/);
  });

  it("strips a period only when it directly adjoins the empty placeholder (.{tag})", () => {
    expect(
      renderWhatsAppTemplate("שלום.{custom_text}", {
        custom_text: "",
      })
    ).toBe("שלום");
  });

  it("keeps sentence period when optional text is separated by space (. {tag})", () => {
    expect(
      renderWhatsAppTemplate("טקסט.{custom_text}", {
        custom_text: "",
      })
    ).toBe("טקסט");
    expect(
      renderWhatsAppTemplate("טקסט. {custom_text}", {
        custom_text: "",
      })
    ).toBe("טקסט.");
  });

  it("leaves unknown braces unchanged", () => {
    expect(renderWhatsAppTemplate("x {unknown} y", {})).toBe("x {unknown} y");
  });

  it("normalizes extra blank lines", () => {
    expect(
      renderWhatsAppTemplate("א\n\n\nב", {})
    ).toBe("א\n\nב");
  });

  it("strips empty confirmation_waze_block (space before tag preserves sentence period)", () => {
    expect(
      renderWhatsAppTemplate("סיום. {confirmation_waze_block} סוף", {
        confirmation_waze_block: "",
      })
    ).toBe("סיום. סוף");
  });
});

describe("reminderTemplateHasRequiredTime", () => {
  it("accepts {זמן_תור} or {time}", () => {
    expect(reminderTemplateHasRequiredTime("x {זמן_תור}")).toBe(true);
    expect(reminderTemplateHasRequiredTime("x {time}")).toBe(true);
    expect(reminderTemplateHasRequiredTime("no time tag")).toBe(false);
  });
});
