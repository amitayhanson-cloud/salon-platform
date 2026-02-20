# Firestore listeners (admin UI)

## Snapshot listeners after refactor

| Location | Label | What it listens to | Bounded / limit |
|----------|--------|--------------------|------------------|
| `admin/bookings/page.tsx` | `bookings-list` | bookings: date range (14 days), orderBy date+time | `limit(500)` |
| `admin/bookings/page.tsx` | `bookings-list-fallback` | same, no orderBy (index fallback) | `limit(500)` |
| `admin/bookings/day/[date]/page.tsx` | `day-workers` | workers, orderBy name | no limit (small set) |
| `admin/bookings/day/[date]/page.tsx` | `day-bookings-date` | bookings: `date == dateKey` | `limit(200)` |
| `admin/bookings/day/[date]/page.tsx` | `day-bookings-date-fallback` | same (index fallback) | `limit(200)` |
| `admin/bookings/day/[date]/page.tsx` | `day-bookings-dateISO` | bookings: `dateISO == dateKey` | `limit(200)` |
| `admin/bookings/day/[date]/cancelled/page.tsx` | `cancelled-workers` | workers | no limit |
| `admin/bookings/day/[date]/cancelled/page.tsx` | `cancelled-day` | bookings: `date == dateKey` (cancelled) | `limit(200)` |
| `admin/bookings/day/[date]/cancelled/page.tsx` | `cancelled-day-fallback` | same (index fallback) | `limit(200)` |
| `admin/bookings/day/[date]/cancelled/page.tsx` | `cancelled-all` | bookings: status in cancelled, orderBy | `limit(100)` |
| `admin/clients/client-card/page.tsx` | `client-card-clients` | clients | `limit(500)` |
| `admin/clients/client-card/page.tsx` | — | **Client booking history**: one-time `getDocs` (no listener) | `limit(100)` active + getDocs(archived) |
| `admin/clients/client-card/ChemicalCard.tsx` | `chemical-card-client` | single client doc (sites/…/clients/{id}) | 1 doc |
| `admin/team/workers/page.tsx` | `workers-list` | workers, orderBy createdAt | `limit(100)` |
| `admin/team/salary/page.tsx` | `salary-workers` | workers | no limit |
| `admin/team/salary/page.tsx` | `salary-bookings` | bookings by period (startAt range or dateISO/day or monthly) | daily/dateISO bounded; monthly `limit(500)` |
| `admin/bookings/print/day/[date]/page.tsx` | `print-workers` | workers | `limit(100)` |
| `admin/bookings/print/day/[date]/page.tsx` | `print-bookings` | bookings: `date == dateKey` | `limit(200)` |

Plus lib-based subscriptions (single doc or small collection) used by admin pages:  
`subscribeSiteConfig`, `subscribeBookingSettings`, `subscribePricingItems`, `subscribeSiteServices`, `subscribeClientTypes`, `subscribeMultiBookingCombos`. These are not wrapped in `onSnapshotDebug` but are created in `useEffect` with cleanup in the same pages.

## How to test for listener leaks

1. **Open the app in development** (`npm run dev`) and open the browser console.
2. **Watch logs**: In dev, every listener created via `onSnapshotDebug` logs:
   - `[Firestore listener +1] <label> | active=<n> | <path>`
   - On cleanup: `[Firestore listener -1] <label> | active=<n>`
3. **Check active count**: In the console run:
   ```js
   window.__getActiveListenerCount?.()
   ```
   (In dev this is set by `lib/firestoreListeners.ts`.) Or watch the `active=` value in the logs: it should go up when you open a page and **down when you navigate away**.
4. **Navigate between admin pages**: e.g. Bookings list → Day view → Client card → Back to list. The `active=` count should **not** grow without bound; leaving a page should reduce it (you should see `-1` logs).
5. **Confirm no per-row listeners**: No listener should be created inside a list item (e.g. per worker row or per booking card). All listeners in the table above are one per page or one per selected client.

## Booking flow and WhatsApp

- **Booking creation flow, follow-ups, multi-booking logic, confirmations, and WhatsApp automation (sending/confirmation) are unchanged.** Only admin UI Firestore read/listener behavior and data loading were modified.
