/**
 * Pure strings for inbound YES/NO system fallbacks (admin preview + server must match).
 */

export function buildClientConfirmSystemFallbackText(params: {
  time: string;
  businessName: string;
  wazeUrl: string;
}): string {
  let reply = `אושר ✅ נתראה ב-${params.time} ב-${params.businessName}.`;
  if (params.wazeUrl.trim()) reply += `\n${params.wazeUrl.trim()}`;
  return reply;
}

export function buildClientCancelSystemFallbackText(businessName: string): string {
  return `בוטל ✅. אם תרצה/י לקבוע מחדש, דבר/י עם ${businessName}.`;
}
