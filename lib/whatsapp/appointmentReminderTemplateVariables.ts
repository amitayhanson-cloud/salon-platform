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
    "2": salonName || "Luxure",
    "3": dateDisplay,
    "4": timeDisplay,
    "5": "מחכים לראות אותך!",
  };
};
