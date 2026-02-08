"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { Check, ChevronDown, ChevronUp, ListTodo, Trash2 } from "lucide-react";
import { ymdLocal } from "@/lib/dateLocal";
import {
  subscribeTasks,
  createTask,
  updateTask,
  deleteTask as deleteTaskApi,
  type Task,
} from "@/lib/firestoreTasks";
import { isTaskOverdue, sortActiveTasks } from "@/lib/taskUtils";

export { isTaskOverdue, sortActiveTasks };

interface TaskListPanelProps {
  siteId: string;
  /** Optional max height so navbar doesn't grow too much (scroll inside). */
  maxHeight?: string;
}

export default function TaskListPanel({ siteId, maxHeight = "280px" }: TaskListPanelProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [newTaskId, setNewTaskId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState<Record<string, string>>({});
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!siteId) return;
    return subscribeTasks(siteId, setTasks, (e) => console.error("[TaskListPanel]", e));
  }, [siteId]);

  const activeTasks = useMemo(() => sortActiveTasks(tasks.filter((t) => !t.completed)), [tasks]);
  const completedTasks = useMemo(
    () => [...tasks.filter((t) => t.completed)].sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)),
    [tasks]
  );

  useEffect(() => {
    if (!newTaskId) return;
    const t = setTimeout(() => {
      titleInputRef.current?.focus();
      setNewTaskId(null);
    }, 100);
    return () => clearTimeout(t);
  }, [newTaskId, activeTasks.length]);

  const handleAddTask = async () => {
    const today = ymdLocal(new Date());
    try {
      const id = await createTask(siteId, { title: "", dueDate: today });
      setNewTaskId(id);
    } catch (e) {
      console.error("[TaskListPanel] create failed", e);
    }
  };

  const handleToggleComplete = async (task: Task) => {
    try {
      await updateTask(siteId, task.id, { completed: !task.completed });
    } catch (e) {
      console.error("[TaskListPanel] update failed", e);
    }
  };

  const handleUpdateTitle = async (task: Task, title: string) => {
    const t = title.trim();
    if (t === task.title) return;
    try {
      await updateTask(siteId, task.id, { title: t || "" });
    } catch (e) {
      console.error("[TaskListPanel] update title failed", e);
    }
  };

  const handleUpdateDueDate = async (task: Task, dueDate: string) => {
    if (dueDate === task.dueDate) return;
    try {
      await updateTask(siteId, task.id, { dueDate });
    } catch (e) {
      console.error("[TaskListPanel] update dueDate failed", e);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    try {
      await deleteTaskApi(siteId, task.id);
    } catch (e) {
      console.error("[TaskListPanel] delete failed", e);
    }
  };

  if (!siteId) return null;

  return (
    <div
      className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden text-right w-full"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200 bg-slate-50">
        <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <ListTodo className="w-4 h-4" />
          משימות
        </span>
        <button
          type="button"
          onClick={handleAddTask}
          className="text-xs px-2 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded font-medium flex-shrink-0"
        >
          הוסף משימה
        </button>
      </div>
      <div style={{ maxHeight, overflowY: "auto" }} className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ fontSize: "12px", tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 sticky top-0">
              <th className="w-10 py-1.5 px-1 font-medium text-slate-600 text-right" scope="col">
                ✅
              </th>
              <th className="w-32 py-1.5 px-2 font-medium text-slate-600 text-right" scope="col">
                תאריך יעד
              </th>
              <th className="py-1.5 px-2 font-medium text-slate-600 text-right min-w-0" scope="col">
                משימה
              </th>
            </tr>
          </thead>
          <tbody>
            {activeTasks.length === 0 && completedTasks.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 px-2 text-slate-500 text-xs text-right">
                  אין משימות. הוסף משימה.
                </td>
              </tr>
            )}
            {activeTasks.map((task) => {
              const overdue = isTaskOverdue(task.dueDate);
              const rowClass = overdue
                ? "bg-red-50/90 border-r-2 border-red-400 text-red-900"
                : "bg-emerald-50/80 text-slate-800";
              return (
                <tr key={task.id} className={`border-b border-slate-100 ${rowClass}`}>
                  <td className="py-1 px-1 align-middle w-10">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleToggleComplete(task)}
                        className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-300 bg-white hover:bg-slate-50"
                        aria-label="סמן כהושלם"
                      >
                        {task.completed ? <Check className="w-3 h-3 text-sky-600" /> : null}
                      </button>
                    </div>
                  </td>
                  <td className="py-1 px-2 align-middle w-32">
                    <input
                      type="date"
                      value={task.dueDate}
                      onChange={(e) => handleUpdateDueDate(task, e.target.value)}
                      className="w-full min-w-0 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none py-0.5 text-right text-inherit"
                      dir="rtl"
                    />
                  </td>
                  <td className="py-1 px-2 align-middle min-w-0">
                    <input
                      ref={newTaskId === task.id ? titleInputRef : undefined}
                      type="text"
                      value={draftTitle[task.id] ?? task.title}
                      onChange={(e) =>
                        setDraftTitle((prev) => ({ ...prev, [task.id]: e.target.value }))
                      }
                      onBlur={(e) => {
                        const raw = draftTitle[task.id] ?? e.target.value;
                        setDraftTitle((prev) => {
                          const next = { ...prev };
                          delete next[task.id];
                          return next;
                        });
                        handleUpdateTitle(task, raw);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="כותרת..."
                      className="w-full min-w-0 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none py-0.5 text-right text-inherit placeholder-slate-400"
                      dir="rtl"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {completedTasks.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setCompletedOpen((o) => !o)}
              className="w-full flex items-center justify-end gap-1 py-1.5 text-xs text-slate-500 hover:bg-slate-100 border-t border-slate-200 px-2"
            >
              {completedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              הושלמו ({completedTasks.length})
            </button>
            {completedOpen && (
              <table className="w-full border-collapse border-t border-slate-200" style={{ fontSize: "12px", tableLayout: "fixed" }}>
                <tbody>
                  {completedTasks.map((task) => (
                    <tr key={task.id} className="border-b border-slate-100 bg-slate-100/60 text-slate-500">
                      <td className="py-1 px-1 align-middle w-10">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleToggleComplete(task)}
                            className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-300 bg-white text-sky-600"
                            aria-label="בטל השלמה"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-1 px-2 align-middle w-32 text-right">{task.dueDate}</td>
                      <td className="py-1 px-2 align-middle line-through text-right min-w-0">{task.title || "—"}</td>
                      <td className="py-1 px-1 align-middle w-10">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(task)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                            aria-label="מחק משימה"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
