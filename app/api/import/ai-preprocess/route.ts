/**
 * AI-assisted pre-processing for CSV/Excel import.
 * Uses OpenAI to detect structure, infer column roles, and normalize data.
 * No Firestore writes. Additive only.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { normalizePhone, isValidPhone } from "@/lib/import/normalize";

export type AIPreprocessResult = {
  normalizedHeaders: string[];
  normalizedRows: Array<{ fullName: string; phone: string; email?: string; notes?: string }>;
  originalRowCount: number;
  cleanedRowCount: number;
  droppedRowsCount: number;
  warnings: string[];
  lowConfidence?: boolean;
};


export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    try {
      const auth = getAdminAuth();
      await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      textBlock,
      headers = [],
      rows = [],
      originalRowCount,
    } = body as {
      textBlock?: string;
      headers?: string[];
      rows?: Record<string, string>[];
      originalRowCount?: number;
    };

    const hasText = typeof textBlock === "string" && textBlock.trim().length > 0;
    const hasStructured = Array.isArray(headers) && Array.isArray(rows);

    if (!hasText && !hasStructured) {
      return NextResponse.json(
        { error: "Invalid request: textBlock or (headers + rows) required" },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    const dataForPrompt = hasText
      ? textBlock
      : JSON.stringify(
          {
            headers,
            rowCount: rows.length,
            sampleRows: rows.slice(0, 15).map((r) => {
              const obj: Record<string, string> = {};
              headers.forEach((h) => {
                obj[h] = String(r[h] ?? "").trim().slice(0, 100);
              });
              return obj;
            }),
          },
          null,
          2
        );

    const systemPrompt = `You are an expert at cleaning salon/client Excel and CSV files for import.

Your task: Analyze the raw parsed data and produce a NORMALIZED table of CLIENTS ONLY (no bookings).

## Input
You receive either:
- A text block with "Headers:" and "Rows:" (pipe-separated or comma-separated values)
- Or a JSON object with headers and rows

## Rules
1. **Detect structure**: Identify the real header row. Ignore title rows, notes, empty rows, decorative/merged content.
2. **Detect column meaning** (Hebrew + English): firstName, lastName, fullName, phone, email, notes, date, service
3. **Output ONLY**: fullName, phone, email (optional), notes (optional)
4. **Normalize**:
   - If firstName + lastName exist → merge into fullName (space-separated)
   - If only fullName exists → use it
   - Normalize phones: strip spaces, dashes, parentheses; remove country code prefix (+972, 972) and leading 0 for Israeli format if needed - keep digits only for storage, but Israeli mobile is typically 9-10 digits (e.g. 0501234567)
   - Drop rows with no usable phone (after normalization, phone must have at least 7 digits)
   - Deduplicate by normalized phone (keep first occurrence)
5. **Clients only** - do NOT create bookings. Ignore date, service, worker columns.
6. **lowConfidence**: set true if the phone column was ambiguous or unclear (e.g. multiple candidates, non-standard headers)

## Output (strict JSON)
{
  "normalizedHeaders": ["fullName", "phone", "email", "notes"],
  "normalizedRows": [{"fullName": "...", "phone": "...", "email": ""|"...", "notes": ""|"..."}],
  "originalRowCount": number,
  "cleanedRowCount": number,
  "droppedRowsCount": number,
  "warnings": ["Hebrew message", ...],
  "lowConfidence": boolean
}

Warnings examples (Hebrew):
- "זוהו שורות ללא טלפון – שורות אלו הוסרו"
- "זוהו לקוחות כפולים לפי טלפון – נשמרה השורה הראשונה"
- "עמודת הטלפון לא ברורה – אנא אשר את המיפוי"

Return ONLY valid JSON, no markdown.`;

    const userContent = hasText
      ? `Analyze this parsed file and produce the normalized client table:\n\n${dataForPrompt}`
      : `Analyze this parsed file and produce the normalized client table:\n\n\`\`\`json\n${dataForPrompt}\n\`\`\``;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Empty response from OpenAI" },
        { status: 500 }
      );
    }

    let parsed: AIPreprocessResult;
    try {
      parsed = JSON.parse(content) as AIPreprocessResult;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON from OpenAI" },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed.normalizedRows) || !Array.isArray(parsed.normalizedHeaders)) {
      return NextResponse.json(
        { error: "Invalid AI output: missing normalizedRows or normalizedHeaders" },
        { status: 500 }
      );
    }

    // Post-validate: ensure phones are valid, normalize (Israeli leading 0), dedupe
    const seenPhones = new Set<string>();
    const validRows: typeof parsed.normalizedRows = [];
    const droppedByPhone: string[] = [];
    for (const row of parsed.normalizedRows) {
      const phoneNorm = normalizePhone(row.phone ?? "");
      if (!isValidPhone(phoneNorm)) {
        droppedByPhone.push(row.fullName || "?");
        continue;
      }
      if (seenPhones.has(phoneNorm)) continue;
      seenPhones.add(phoneNorm);
      validRows.push({
        fullName: String(row.fullName ?? "").trim() || "—",
        phone: phoneNorm,
        email: row.email != null ? String(row.email).trim() : undefined,
        notes: row.notes != null ? String(row.notes).trim() : undefined,
      });
    }

    const finalDropped = parsed.normalizedRows.length - validRows.length;
    if (finalDropped > 0 && !parsed.warnings.some((w) => w.includes("טלפון"))) {
      parsed.warnings.push("זוהו שורות ללא טלפון תקין – שורות אלו הוסרו");
    }

    const rowCount = hasStructured ? rows.length : originalRowCount ?? 0;
    const result: AIPreprocessResult = {
      normalizedHeaders: ["fullName", "phone", "email", "notes"],
      normalizedRows: validRows,
      originalRowCount: parsed.originalRowCount ?? rowCount,
      cleanedRowCount: validRows.length,
      droppedRowsCount: parsed.droppedRowsCount ?? finalDropped,
      warnings: parsed.warnings ?? [],
      lowConfidence: parsed.lowConfidence ?? false,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("AI preprocess error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI preprocess failed" },
      { status: 500 }
    );
  }
}
