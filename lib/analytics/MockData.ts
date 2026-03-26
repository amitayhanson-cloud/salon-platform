/**
 * High-growth shaped demo series for Basic-plan dashboard analytics teasers (8 points, oldest → newest).
 */

export const MOCK_REVENUE_WEEKLY_ILS = [8200, 9100, 10400, 11200, 12800, 14100, 15600, 17250];

export const MOCK_WHATSAPP_WEEKLY_MESSAGES = [42, 51, 58, 64, 73, 81, 94, 108];

export const MOCK_BOOKINGS_WEEKLY_COUNT = [28, 34, 39, 45, 52, 58, 67, 76];

export const MOCK_CLIENTS_CUMULATIVE = [120, 128, 135, 142, 151, 158, 166, 174];

export const MOCK_NEW_CLIENTS_WEEKLY = [3, 5, 4, 6, 4, 5, 7, 6];

export const MOCK_CANCELLATIONS_WEEKLY = [2, 1, 3, 2, 4, 2, 1, 3];

export const MOCK_UTILIZATION_WEEKLY = [62, 58, 71, 65, 74, 69, 77, 72];

export const MOCK_TRAFFIC_WEEKLY = [12, 15, 14, 18, 16, 20, 22, 24];

export type AnalyticsMetricKind =
  | "revenue"
  | "whatsapp"
  | "bookings"
  | "clients"
  | "newClients"
  | "cancellations"
  | "utilization"
  | "traffic";

export function getMockSeriesForMetric(kind: AnalyticsMetricKind): number[] {
  switch (kind) {
    case "revenue":
      return [...MOCK_REVENUE_WEEKLY_ILS];
    case "whatsapp":
      return [...MOCK_WHATSAPP_WEEKLY_MESSAGES];
    case "bookings":
      return [...MOCK_BOOKINGS_WEEKLY_COUNT];
    case "clients":
      return [...MOCK_CLIENTS_CUMULATIVE];
    case "newClients":
      return [...MOCK_NEW_CLIENTS_WEEKLY];
    case "cancellations":
      return [...MOCK_CANCELLATIONS_WEEKLY];
    case "utilization":
      return [...MOCK_UTILIZATION_WEEKLY];
    case "traffic":
      return [...MOCK_TRAFFIC_WEEKLY];
    default:
      return [...MOCK_BOOKINGS_WEEKLY_COUNT];
  }
}

function resampleSeries(src: number[], targetLen: number): number[] {
  if (src.length === 0) return Array.from({ length: targetLen }, () => 0);
  if (src.length === targetLen) return [...src];
  if (targetLen === 1) return [src[src.length - 1] ?? 0];
  return Array.from({ length: targetLen }, (_, i) => {
    const t = (i / (targetLen - 1)) * (src.length - 1);
    const j = Math.floor(t);
    const f = t - j;
    const a = src[j] ?? 0;
    const b = src[Math.min(j + 1, src.length - 1)] ?? 0;
    return Math.round(a + f * (b - a));
  });
}

export type MockChartGranularity = "week" | "month" | "year";

/** Placeholder labels when real Firestore bundle is not loaded */
export function mockChartLabels(granularity: MockChartGranularity): string[] {
  if (granularity === "week") {
    return ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "יום ש׳"];
  }
  const n = granularity === "month" ? 30 : 12;
  return Array.from({ length: n }, (_, i) => String(i + 1));
}

export function getMockValuesForGranularity(
  kind: AnalyticsMetricKind,
  granularity: MockChartGranularity
): number[] {
  const base = getMockSeriesForMetric(kind);
  if (granularity === "week") return resampleSeries(base, 7);
  if (granularity === "month") return resampleSeries(base, 30);
  return resampleSeries(base, 12);
}
