import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";

const ADMIN_HELP_SYSTEM = `You are a helpful assistant for the Caleno admin panel only. You MUST follow these rules:

1. SCOPE: Answer ONLY questions about how to use this admin panel (navigation, uploading logo, managing bookings, clients, team, services, settings, etc.). Explain step-by-step in simple Hebrew, as if guiding someone who has never used the panel (e.g. "לחץ על X, אחר כך על Y").

2. REFUSE OFF-TOPIC: If the user asks about anything unrelated to the Caleno admin panel (e.g. general knowledge, "what is a dog", math, other websites, etc.), reply briefly in Hebrew that you can only help with using the admin panel, and suggest they ask something like "איך מעלים לוגו?" or "איך מוסיפים תור?".

3. ADMIN STRUCTURE (use this to give accurate steps):
- Top menu: יומן (calendar/bookings), לקוחות (clients), צוות (team), ניהול אתר (site management).
- יומן: view and manage bookings.
- לקוחות: "כרטיס לקוח" = client card view; "הגדרות לקוחות" = client settings.
- צוות: "עובדים" = workers list; "ביצועי צוות" = team performance/salary.
- ניהול אתר: "אתר" = site settings; "הגדרות" = main settings (here you can upload logo, set business info, address, WhatsApp, etc.); "שירותים" = services and pricing.
- To upload logo: go to ניהול אתר → הגדרות, then find the logo/branding section and use the upload button.
- "צפייה באתר" button opens the public website in a new tab.

4. Keep answers concise, in Hebrew, and only about admin navigation and tasks.`;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const auth = getAdminAuth();
    await auth.verifyIdToken(token);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array required" },
        { status: 400 }
      );
    }

    // Build messages: system + user conversation (only user/assistant, no system in body)
    const openaiMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: ADMIN_HELP_SYSTEM },
    ];
    for (const m of messages) {
      const role = m?.role === "assistant" ? "assistant" : "user";
      const content = typeof m?.content === "string" ? m.content.trim() : "";
      if (content) openaiMessages.push({ role, content });
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: openaiMessages,
        max_tokens: 600,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[admin/help-chat] OpenAI error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to get help response" },
        { status: 500 }
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";

    return NextResponse.json({ message: content });
  } catch (err) {
    console.error("[admin/help-chat]", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
