import { describe, it, expect } from "vitest";
import { isTaskOverdue, sortActiveTasks } from "../../lib/taskUtils";
import type { Task } from "../../lib/firestoreTasks";

const today = "2026-02-05";

describe("isTaskOverdue", () => {
  it("returns true when dueDate is before today", () => {
    expect(isTaskOverdue("2026-02-04", today)).toBe(true);
    expect(isTaskOverdue("2026-02-01", today)).toBe(true);
  });

  it("returns false when dueDate is today", () => {
    expect(isTaskOverdue("2026-02-05", today)).toBe(false);
  });

  it("returns false when dueDate is after today", () => {
    expect(isTaskOverdue("2026-02-06", today)).toBe(false);
  });
});

describe("sortActiveTasks", () => {
  const mk = (dueDate: string, id: string): Task => ({
    id,
    siteId: "s1",
    title: "",
    dueDate,
    completed: false,
    createdAt: "",
    updatedAt: "",
  });

  it("puts overdue first, then by nearest due date", () => {
    const tasks = [
      mk("2026-02-10", "a"),
      mk("2026-02-03", "b"),
      mk("2026-02-07", "c"),
      mk("2026-02-01", "d"),
    ];
    const sorted = sortActiveTasks(tasks, today);
    const ids = sorted.map((t) => t.id);
    expect(ids).toEqual(["d", "b", "c", "a"]);
  });

  it("sorts overdue by oldest first", () => {
    const tasks = [mk("2026-02-04", "a"), mk("2026-02-02", "b")];
    const sorted = sortActiveTasks(tasks, today);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("a");
  });

  it("completion removes from active list (caller filters completed)", () => {
    const tasks = [
      mk("2026-02-04", "a"),
      { ...mk("2026-02-06", "b"), completed: true },
    ];
    const active = tasks.filter((t) => !t.completed);
    const sorted = sortActiveTasks(active, today);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("a");
  });
});
