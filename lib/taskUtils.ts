import { ymdLocal } from "./dateLocal";
import type { Task } from "./firestoreTasks";

/** True if dueDate (YYYY-MM-DD) is before today (start-of-day comparison). Due today = not overdue. */
export function isTaskOverdue(dueDate: string, todayOverride?: string): boolean {
  const today = todayOverride ?? ymdLocal(new Date());
  return dueDate < today;
}

/** Sort active tasks: overdue first (oldest first), then upcoming by nearest due date. */
export function sortActiveTasks(tasks: Task[], todayOverride?: string): Task[] {
  const today = todayOverride ?? ymdLocal(new Date());
  return [...tasks].sort((a, b) => {
    const aOver = a.dueDate < today;
    const bOver = b.dueDate < today;
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    if (aOver && bOver) return a.dueDate.localeCompare(b.dueDate);
    return a.dueDate.localeCompare(b.dueDate);
  });
}
