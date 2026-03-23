/**
 * Sandbox mapping wrapper for Twilio WhatsApp Sandbox testing mode.
 * Keeps variables visible on-device while enforcing predictable message formats.
 */

export type SandboxAutomation =
  | "booking_confirmation"
  | "reminder_24h"
  | "owner_broadcast"
  | "cancellation_confirmation"
  | "outbound";

/**
 * Normalize for sandbox: trim ends, collapse spaces within a line, preserve newlines
 * (Twilio Sandbox prefix + readable Yes/No blocks). Avoid merging paragraphs into one line.
 */
function normalizeSandboxBody(text: string): string {
  const raw = text ?? "";
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function mapBodyForSandbox(input: {
  body: string;
  automation?: string | null;
}): string {
  const body = normalizeSandboxBody(input.body);
  const automation = (input.automation ?? "outbound") as SandboxAutomation;
  if (!body) return "";

  switch (automation) {
    case "booking_confirmation":
      return `*Sandbox* אישור תור:\n${body}`;
    case "reminder_24h":
      return `*Sandbox* תזכורת:\n${body}`;
    case "owner_broadcast":
      return `*Sandbox* הודעה קבוצתית:\n${body}`;
    case "cancellation_confirmation":
      return `*Sandbox* אישור ביטול:\n${body}`;
    default:
      return `*Sandbox* הודעה:\n${body}`;
  }
}

