/**
 * Client-side helper: trigger the same WhatsApp flow as public booking (onBookingCreated).
 * Call after admin creates a booking so the customer gets confirmation + reminders.
 * Respects global WhatsApp kill-switch (enforced server-side in sendWhatsApp).
 */

/**
 * Calls POST /api/bookings/trigger-whatsapp. Fire-and-forget; logs errors but does not throw.
 * Use after createAdminBooking or saveMultiServiceBooking to get identical WhatsApp behavior.
 */
export async function triggerBookingWhatsApp(
  siteId: string,
  bookingId: string,
  getToken: () => Promise<string | undefined>
): Promise<void> {
  try {
    const token = await getToken();
    if (!token) {
      console.warn("[triggerBookingWhatsApp] No auth token, skipping");
      return;
    }
    const res = await fetch("/api/bookings/trigger-whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ siteId, bookingId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn("[triggerBookingWhatsApp] Failed", res.status, data);
    }
  } catch (e) {
    console.warn("[triggerBookingWhatsApp]", e);
  }
}
