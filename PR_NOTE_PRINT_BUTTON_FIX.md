# Print button fix (bookings day page) – PR note

## Root cause

The Print button on the bookings day page was **visible but not clickable in production** because of **stacking and scroll behavior**:

1. **Sticky admin header**  
   The admin layout uses a sticky header (`AdminHeader` with `sticky top-0 z-50`). The day page content (toolbar + schedule) lives inside `<main>` and can scroll.

2. **Toolbar scrolling under the header**  
   When the user scrolls, the day toolbar (with the Print button) scrolls up and can sit **under** the sticky admin header. The header has a higher `z-index` (50), so it was on top and **captured all clicks** in that area. The Print button was still visible (e.g. peeking below the header or in RTL layout) but the click hit the header instead.

3. **No explicit stacking for the toolbar**  
   The schedule area did not have an explicit `z-index`, so stacking was ambiguous. In some viewport/build scenarios (e.g. production) the schedule or other content could also affect which element received pointer events.

So the issue was **not**:
- an invisible overlay (no full-page overlay when modals are closed),
- `pointer-events: none` on the button,
- or the button being disabled by state/env.

It was **stacking + sticky header**: the toolbar (and thus the Print button) was effectively covered by the sticky header when scrolling, so the header received the click.

## Fix

1. **Toolbar always on top of schedule and sticky below the header**  
   - Wrapped the day toolbar in a bar that is `sticky top-16 z-40` with `bg-slate-50` (`top-16` = 64px matches the admin header height `h-16`).  
   - When the user scrolls, the toolbar now sticks **just below** the admin header and stays visible and clickable instead of sliding under it.

2. **Explicit stacking for the schedule**  
   - Gave the schedule area `relative z-0` so the toolbar (`z-40`) is clearly above it and always receives clicks.

3. **Robust print action**  
   - Replaced the Print `<a>` with a `<button>` that calls `window.open(url, "_blank", "noopener,noreferrer")` in an `onClick` handler.  
   - This avoids relying on anchor navigation, which could be blocked or intercepted by overlays or focus/stacking in production.

4. **Regression guard**  
   - Added a Playwright e2e test that navigates to the bookings day page, asserts the Print button is visible, selects a worker, and checks that clicking opens the print-day URL in a new tab.

## How to run the e2e test

- **Local (with dev server):** `npm run test:e2e` (starts dev server if needed).  
- **With auth:** The day page is behind admin auth. To run the full flow (including the click), use a real site ID and run while logged in, e.g.  
  `E2E_SITE_ID=your-site-id npm run test:e2e`  
  If the test is run without auth, it will skip after detecting a redirect to login.
