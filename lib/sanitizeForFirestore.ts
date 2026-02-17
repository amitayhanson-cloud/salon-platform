/**
 * Recursively remove undefined values so Firestore never receives undefined.
 * Arrays: filter out undefined elements and sanitize objects inside.
 * Preserves null, primitives, Date, and Firestore Timestamp-like objects.
 * In development, logs paths of removed keys.
 */
function collectUndefinedPaths(
  value: unknown,
  path: string
): string[] {
  if (value === undefined) return [path];
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];
  if (
    typeof (value as { toMillis?: unknown }).toMillis === "function" ||
    typeof (value as { toDate?: unknown }).toDate === "function"
  )
    return [];
  if (Array.isArray(value)) {
    const out: string[] = [];
    value.forEach((item, i) => {
      out.push(...collectUndefinedPaths(item, `${path}[${i}]`));
    });
    return out;
  }
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) {
      out.push(path ? `${path}.${k}` : k);
    } else {
      out.push(...collectUndefinedPaths(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) return value;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (
    typeof (value as { toMillis?: unknown }).toMillis === "function" ||
    typeof (value as { toDate?: unknown }).toDate === "function"
  )
    return value;
  if (Array.isArray(value)) {
    const sanitized = value.map((item) => stripUndefinedDeep(item)).filter((v) => v !== undefined);
    return sanitized as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = stripUndefinedDeep(v);
  }
  return out as T;
}

/**
 * Sanitize a value for Firestore: remove all undefined keys/entries.
 * In development, logs which paths were stripped (for debugging).
 */
export function sanitizeForFirestore<T>(value: T): T {
  const removed = collectUndefinedPaths(value, "");
  if (removed.length > 0 && process.env.NODE_ENV !== "production") {
    console.log("[sanitizeForFirestore] Removed undefined at paths:", removed);
  }
  return stripUndefinedDeep(value);
}
