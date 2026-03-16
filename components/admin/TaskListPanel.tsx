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
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);

  const resizeTitleField = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

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
    setEditingTaskId(newTaskId);
    const t = setTimeout(() => {
      titleInputRef.current?.focus();
      setNewTaskId(null);
    }, 100);
    return () => clearTimeout(t);
  }, [newTaskId, activeTasks.length]);

  useEffect(() => {
    if (!editingTaskId) return;
    const t = setTimeout(() => titleInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [editingTaskId]);

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
      className="rounded-2xl border border-[#E2E8F0] bg-white shadow-sm overflow-hidden text-right w-full"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#E2E8F0] bg-[rgba(30,111,124,0.04)]">
        <span className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
          <ListTodo className="w-4 h-4" />
          משימות
        </span>
        <button
          type="button"
          onClick={handleAddTask}
          className="flex-shrink-0 rounded-full bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-[#1E293B]"
        >
          הוסף משימה
        </button>
      </div>
      <div style={{ maxHeight, overflowY: "auto" }} className="overflow-x-auto">
        {/* Mobile: card list */}
        <div className="block md:hidden px-3 py-2 space-y-2">
          {activeTasks.length === 0 && completedTasks.length === 0 && (
            <p className="py-4 text-slate-500 text-sm text-right">אין משימות. הוסף משימה.</p>
          )}
          {activeTasks.map((task) => {
            const overdue = isTaskOverdue(task.dueDate);
            const cardClass = overdue
              ? "rounded-xl border border-red-200/80 bg-red-50/90 p-3"
              : "rounded-xl border border-slate-200 bg-emerald-50/80 p-3";
            return (
              <div key={task.id} className={cardClass}>
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggleComplete(task)}
                    className="flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                    aria-label="סמן כהושלם"
                  >
                    {task.completed ? <Check className="w-4 h-4 text-caleno-deep" /> : null}
                  </button>
                  <div className="min-w-0 flex-1">
                    {editingTaskId === task.id ? (
                      <textarea
                        ref={(el) => {
                          titleInputRef.current = el;
                          if (el) resizeTitleField(el);
                        }}
                        rows={2}
                        value={draftTitle[task.id] ?? task.title}
                        onChange={(e) => {
                          setDraftTitle((prev) => ({ ...prev, [task.id]: e.target.value }));
                          resizeTitleField(e.target);
                        }}
                        onBlur={(e) => {
                          const raw = draftTitle[task.id] ?? e.target.value;
                          setDraftTitle((prev) => {
                            const next = { ...prev };
                            delete next[task.id];
                            return next;
                          });
                          handleUpdateTitle(task, raw);
                          setEditingTaskId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="כותרת..."
                        className="w-full min-h-0 resize-none overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 placeholder-slate-400 focus:border-caleno-deep focus:outline-none focus:ring-2 focus:ring-caleno-deep/20"
                        style={{ minHeight: "2.5rem", maxHeight: "120px" }}
                        dir="rtl"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingTaskId(task.id)}
                        className="w-full min-w-0 overflow-hidden text-right text-sm font-medium text-slate-800 hover:opacity-80 block"
                      >
                        <span className="w-full min-w-0 whitespace-normal text-right line-clamp-2 break-words">
                          {task.title?.trim() || "כותרת..."}
                        </span>
                      </button>
                    )}
                    <input
                      type="date"
                      value={task.dueDate}
                      onChange={(e) => handleUpdateDueDate(task, e.target.value)}
                      className="mt-1.5 w-full min-w-0 rounded border-0 bg-transparent py-1 text-xs text-slate-600 focus:border-caleno-deep focus:outline-none"
                      dir="rtl"
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {completedTasks.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setCompletedOpen((o) => !o)}
                className="w-full flex items-center justify-end gap-1 py-2 text-xs text-slate-500 hover:bg-slate-100 rounded-lg px-2"
              >
                {completedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                הושלמו ({completedTasks.length})
              </button>
              {completedOpen &&
                completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-slate-200 bg-slate-100/60 p-3 flex items-center gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleComplete(task)}
                      className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-caleno-deep"
                      aria-label="בטל השלמה"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-sm text-slate-500 line-through line-clamp-2 break-words whitespace-normal text-right min-w-0">
                        {task.title || "—"}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 text-right">{task.dueDate}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTask(task)}
                      className="flex-shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      aria-label="מחק משימה"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>

        {/* Desktop: table */}
        <table className="hidden md:table w-full border-collapse" style={{ fontSize: "12px", tableLayout: "fixed" }}>
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
                        {task.completed ? <Check className="w-3 h-3 text-caleno-deep" /> : null}
                      </button>
                    </div>
                  </td>
                  <td className="py-1 px-2 align-middle w-32">
                    <input
                      type="date"
                      value={task.dueDate}
                      onChange={(e) => handleUpdateDueDate(task, e.target.value)}
                      className="w-full min-w-0 bg-transparent border-0 border-b border-transparent hover:border-slate-300 focus:border-caleno-deep focus:outline-none py-0.5 text-right text-inherit"
                      dir="rtl"
                    />
                  </td>
                  <td className="py-1 px-2 align-middle min-w-0 overflow-hidden">
                    {editingTaskId === task.id ? (
                      <textarea
                        ref={(el) => {
                          titleInputRef.current = el;
                          if (el) resizeTitleField(el);
                        }}
                        rows={2}
                        value={draftTitle[task.id] ?? task.title}
                        onChange={(e) => {
                          setDraftTitle((prev) => ({ ...prev, [task.id]: e.target.value }));
                          resizeTitleField(e.target);
                        }}
                        onBlur={(e) => {
                          const raw = draftTitle[task.id] ?? e.target.value;
                          setDraftTitle((prev) => {
                            const next = { ...prev };
                            delete next[task.id];
                            return next;
                          });
                          handleUpdateTitle(task, raw);
                          setEditingTaskId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder="כותרת..."
                        className="w-full min-w-0 min-h-0 resize-none overflow-y-auto bg-transparent border-0 border-b border-transparent py-0.5 text-right text-sm leading-relaxed text-inherit placeholder-slate-400 hover:border-slate-300 focus:border-caleno-deep focus:outline-none"
                        style={{ minHeight: "1.5rem", maxHeight: "120px" }}
                        dir="rtl"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingTaskId(task.id)}
                        className="w-full min-w-0 text-right py-0.5 text-inherit hover:opacity-80 block overflow-hidden"
                      >
                        <span className="line-clamp-2 break-words">
                          {task.title?.trim() || "כותרת..."}
                        </span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {completedTasks.length > 0 && (
          <div className="hidden md:block">
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
                            className="inline-flex items-center justify-center w-5 h-5 rounded border border-slate-300 bg-white text-caleno-deep"
                            aria-label="בטל השלמה"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-1 px-2 align-middle w-32 text-right">{task.dueDate}</td>
                      <td className="py-1 px-2 align-middle line-through text-right min-w-0 overflow-hidden">
                        <span className="line-clamp-2 break-words block">{task.title || "—"}</span>
                      </td>
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
          </div>
        )}
      </div>
    </div>
  );
}
