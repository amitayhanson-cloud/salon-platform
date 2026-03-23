import type { WhatsAppTemplateVariables } from "@/types/whatsappSettings";

const ALIASES: Record<string, readonly string[]> = {
  שם_לקוח: ["שם_לקוח", "client_name"],
  שם_העסק: ["שם_העסק", "business_name"],
  קישור_לתיאום: ["קישור_לתיאום", "link"],
  זמן_תור: ["זמן_תור", "time"],
  תאריך_תור: ["תאריך_תור", "date"],
  custom_text: ["custom_text"],
  waze_link: ["waze_link", "קישור_וויז"],
  confirmation_waze_block: ["confirmation_waze_block", "בלוק_וויז_אישור"],
  reminder_waze_block: ["reminder_waze_block", "בלוק_וויז_תזכורת"],
};

function placeholderKeyToCanonical(key: string): string | null {
  const trimmed = key.trim();
  if (Object.prototype.hasOwnProperty.call(ALIASES, trimmed)) {
    return trimmed;
  }
  for (const [canonical, aliasKeys] of Object.entries(ALIASES)) {
    if (aliasKeys.includes(trimmed)) return canonical;
  }
  return null;
}

function getResolvedString(canonical: string, vars: WhatsAppTemplateVariables): string | undefined {
  const keys = ALIASES[canonical] ?? [canonical];
  const raw =
    (vars as Record<string, string | undefined>)[canonical] ??
    keys.map((k) => (vars as Record<string, string | undefined>)[k]).find((v) => v != null && v !== "");
  if (raw == null) return undefined;
  const s = typeof raw === "string" ? raw.trim() : String(raw).trim();
  return s === "" ? undefined : s;
}

/** Collapse horizontal whitespace; trim lines; cap blank runs at one empty line. */
function normalizeWhitespace(s: string): string {
  return s
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Replace {שם_לקוח}, {client_name}, etc. with provided values.
 * Known placeholders with empty / missing values are removed; optional glue before the tag
 * (spaces and/or a single period meant to connect the segment) is stripped so you don't get
 * a trailing " ." or lone dot. Unknown `{tags}` are left unchanged.
 */
export function renderWhatsAppTemplate(
  template: string,
  vars: WhatsAppTemplateVariables
): string {
  const re = /\{([^}]+)\}/g;
  const matches: { start: number; end: number; key: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, key: m[1] ?? "" });
  }

  if (matches.length === 0) {
    return normalizeWhitespace(template);
  }

  let out = template;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, key } = matches[i]!;
    const canonical = placeholderKeyToCanonical(key);
    if (canonical == null) {
      continue;
    }
    const val = getResolvedString(canonical, vars);
    if (val !== undefined) {
      out = out.slice(0, start) + val + out.slice(end);
    } else {
      let glueStart = start;
      while (glueStart > 0 && /[\s\u00a0]/.test(out[glueStart - 1]!)) {
        glueStart--;
      }
      const hadWhitespaceImmediatelyBeforeBrace = glueStart < start;
      // Only treat "." as glue when it touches the placeholder (`.{tag}`). If the template has
      // `.{tag}` we remove the dot; for `. {tag}` the dot ends the previous sentence — keep it.
      if (!hadWhitespaceImmediatelyBeforeBrace && glueStart > 0 && out[glueStart - 1] === ".") {
        glueStart--;
        while (glueStart > 0 && /[\s\u00a0]/.test(out[glueStart - 1]!)) {
          glueStart--;
        }
      }
      out = out.slice(0, glueStart) + out.slice(end);
    }
  }

  return normalizeWhitespace(out);
}

export function reminderTemplateHasRequiredTime(template: string): boolean {
  return template.includes("{זמן_תור}") || template.includes("{time}");
}
