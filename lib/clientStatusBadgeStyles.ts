import type { AutomatedClientStatus } from "@/types/clientStatus";

/** Matches admin client-settings status pill colors (חדש / פעיל / רדום / רגיל). */
const BASE =
  "inline-flex items-center rounded-full px-2 py-0.5 font-bold";

export function automatedStatusBadgeClass(status: AutomatedClientStatus): string {
  switch (status) {
    case "new":
      return `${BASE} bg-blue-100 text-blue-800`;
    case "active":
      return `${BASE} bg-emerald-100 text-emerald-800`;
    case "sleeping":
      return `${BASE} bg-amber-100 text-amber-800`;
    case "normal":
    default:
      return `${BASE} bg-slate-200 text-slate-800`;
  }
}
