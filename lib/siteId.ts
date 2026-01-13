export function createSiteIdFromName(name: string): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[\s]+/g, "-")
      .replace(/[^a-z0-9\-]/g, "") || "salon";

  const suffix = Date.now().toString(36);

  return `${base}-${suffix}`;
}
