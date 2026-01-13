/**
 * Normalizes a services array to remove duplicates, empty strings, and trim whitespace.
 * Preserves order of first occurrence.
 */
export function normalizeServices(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const v of input) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }

  return out;
}

