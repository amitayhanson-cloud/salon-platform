/**
 * Meta / Twilio `appointment_reminder_v1`: exactly four body variables.
 * {{1}} name, {{2}} salon, {{3}} date (dd/MM/yyyy), {{4}} time (HH:mm).
 */
export const buildAppointmentReminderTemplateVariables = (params: {
  customerDisplayName: string;
  salonName: string;
  dateDisplay: string;
  timeDisplay: string;
}) => {
  const customerDisplayName = (params.customerDisplayName ?? "").trim();
  const salonName = (params.salonName ?? "").trim();
  const dateDisplay = (params.dateDisplay ?? "").trim();
  const timeDisplay = (params.timeDisplay ?? "").trim();

  return {
    "1": customerDisplayName || "לקוח",
    "2": salonName || "העסק",
    "3": dateDisplay,
    "4": timeDisplay,
  };
};
