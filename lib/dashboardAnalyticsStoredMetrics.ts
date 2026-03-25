/** Shared shape for per-day and monthly dashboard analytics aggregates (Firestore + in-memory). */
export type StoredMetrics = {
  revenue: number;
  bookings: number;
  whatsappCount: number;
  clientsCumulative: number;
  newClients: number;
  cancellations: number;
  utilizationPercent: number;
  trafficAttributedBookings: number;
  bookedMinutes: number;
  capacityMinutes: number;
};
