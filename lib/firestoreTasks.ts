"use client";

import {
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { tasksCollection, taskDoc } from "./firestorePaths";
import { ymdLocal } from "./dateLocal";

export interface Task {
  id: string;
  siteId: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

function taskFromDoc(id: string, data: Record<string, unknown>): Task {
  const due = data.dueDate;
  const dueStr =
    typeof due === "string"
      ? due
      : due && typeof (due as { toDate?: () => Date }).toDate === "function"
        ? ymdLocal((due as { toDate: () => Date }).toDate())
        : ymdLocal(new Date());
  const ts = (v: unknown): string =>
    v && typeof (v as { toDate?: () => Date }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate().toISOString()
      : typeof v === "string"
        ? v
        : "";
  return {
    id,
    siteId: (data.siteId as string) ?? "",
    title: (data.title as string) ?? "",
    dueDate: dueStr,
    completed: Boolean(data.completed),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
    completedAt: data.completedAt ? ts(data.completedAt) : undefined,
  };
}

/**
 * Subscribe to tasks for a site. Realtime updates.
 */
export function subscribeTasks(
  siteId: string,
  onTasks: (tasks: Task[]) => void,
  onError?: (err: Error) => void
): () => void {
  const col = tasksCollection(siteId);
  const q = query(col, orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snapshot) => {
      const tasks = snapshot.docs.map((d) => taskFromDoc(d.id, d.data()));
      onTasks(tasks);
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err)))
  );
}

/**
 * Create a task. dueDate as YYYY-MM-DD.
 */
export async function createTask(
  siteId: string,
  data: { title: string; dueDate: string }
): Promise<string> {
  const col = tasksCollection(siteId);
  const ref = await addDoc(col, {
    siteId,
    title: data.title ?? "",
    dueDate: data.dueDate,
    completed: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update task (partial). dueDate as YYYY-MM-DD if provided.
 */
export async function updateTask(
  siteId: string,
  taskId: string,
  data: Partial<{ title: string; dueDate: string; completed: boolean }>
): Promise<void> {
  const ref = taskDoc(siteId, taskId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.title !== undefined) payload.title = data.title;
  if (data.dueDate !== undefined) payload.dueDate = data.dueDate;
  if (data.completed !== undefined) {
    payload.completed = data.completed;
    if (data.completed) payload.completedAt = serverTimestamp();
  }
  await updateDoc(ref, payload);
}

/**
 * Delete a task.
 */
export async function deleteTask(siteId: string, taskId: string): Promise<void> {
  await deleteDoc(taskDoc(siteId, taskId));
}
