/**
 * Helper functions for displaying booking information
 */

import { getMinutesSinceStartOfDay, minutesToTime } from "./calendarUtils";

interface BookingDisplayInfo {
  clientLabel: string;
  serviceLabel: string;
  serviceType?: string;
  phoneNumber?: string;
  timeLabel: string;
  fullTooltip: string;
}

/**
 * Extract display information from a booking object
 * Handles different field name variations and provides consistent labels
 */
export function getBookingDisplayInfo(booking: {
  customerName?: string;
  clientName?: string;
  customerPhone?: string;
  phone?: string;
  serviceName?: string;
  serviceType?: string;
  serviceCategory?: string;
  service?: { 
    name?: string; 
    title?: string;
    type?: string;
    category?: string;
  };
  time?: string;
  durationMin?: number;
  duration?: number; // Also check duration field (stored in booking blocks)
  workerName?: string;
  workerId?: string | null;
  note?: string;
}): BookingDisplayInfo {
  // Extract client name (try multiple field names)
  const clientName = booking.customerName || booking.clientName || "לקוח לא ידוע";
  
  // Extract phone number (try multiple field names)
  const phoneNumber = booking.customerPhone || booking.phone || undefined;
  
  // Extract service name (try multiple field names)
  const serviceName = 
    booking.serviceName || 
    booking.service?.name || 
    booking.service?.title || 
    "שירות לא ידוע";
  
  // Extract service type/category (try multiple field names)
  const serviceType = 
    booking.serviceType || 
    booking.serviceCategory ||
    booking.service?.type ||
    booking.service?.category ||
    undefined;
  
  // Calculate time range if we have start time and duration
  // Check both durationMin and duration fields
  const duration = booking.durationMin || booking.duration;
  let timeLabel = booking.time || "";
  if (booking.time && duration) {
    const startMinutes = getMinutesSinceStartOfDay(booking.time);
    const endMinutes = startMinutes + duration;
    const endTime = minutesToTime(endMinutes);
    timeLabel = `${booking.time}–${endTime}`;
  }
  
  // Build full tooltip: "Client — Service (Type) — Phone"
  const tooltipParts = [clientName, serviceName];
  if (serviceType) tooltipParts.push(`(${serviceType})`);
  if (phoneNumber) tooltipParts.push(phoneNumber);
  const fullTooltip = tooltipParts.join(" — ");
  
  return {
    clientLabel: clientName,
    serviceLabel: serviceName,
    serviceType,
    phoneNumber,
    timeLabel,
    fullTooltip,
  };
}
