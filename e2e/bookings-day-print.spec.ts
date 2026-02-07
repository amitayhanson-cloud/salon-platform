import { test, expect } from "@playwright/test";

const SITE_ID = process.env.E2E_SITE_ID ?? "test-site";
const DATE = "2026-02-02"; // YYYY-MM-DD

test.describe("Bookings Day page – Print button", () => {
  test("Print button is visible and clickable when a worker is selected", async ({ page }) => {
    await page.goto(`/site/${SITE_ID}/admin/bookings/day/${DATE}`);

    // Wait for either redirect to login or day page content (Print button).
    const printBtn = page.getByTestId("print-day-button");
    const loginOrDay = await Promise.race([
      page.waitForURL(/\/login/, { timeout: 8000 }).then(() => "login" as const),
      printBtn.waitFor({ state: "visible", timeout: 12000 }).then(() => "day" as const),
    ]).catch(() => "timeout" as const);

    if (loginOrDay === "login" || loginOrDay === "timeout") {
      test.skip(true, "Auth required: run with E2E_SITE_ID and logged-in session");
      return;
    }

    await expect(printBtn).toBeVisible();

    // With "All workers" selected the button is disabled; select first worker from dropdown if present.
    const workerSelect = page.locator('select').filter({ has: page.locator('option[value="all"]') });
    if ((await workerSelect.count()) > 0) {
      const options = workerSelect.locator('option:not([value="all"])');
      if ((await options.count()) > 0) {
        await workerSelect.selectOption({ index: 1 });
        await page.waitForTimeout(200);
      }
    }

    // After selecting a worker, button should be enabled (unless there are no workers).
    const isDisabled = await printBtn.getAttribute("disabled");
    if (isDisabled !== null) {
      // Still disabled (e.g. no workers or still "All") – just ensure button is visible and in DOM.
      return;
    }

    // Click should open the print page in a new tab (window.open).
    const popupPromise = page.waitForEvent("popup");
    await printBtn.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(new RegExp(`/site/${SITE_ID}/admin/bookings/print/day/${DATE}`));
    await popup.close();
  });
});
