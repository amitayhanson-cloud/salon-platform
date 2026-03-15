import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";

const ADMIN_HELP_SYSTEM = `You are an expert assistant for the Caleno admin panel. You know the exact structure and navigation. Answer ONLY questions about using this admin panel. Always answer in Hebrew. Be precise and step-by-step.

## RULES
1. SCOPE: Only answer questions about the Caleno admin panel (navigation, how to do tasks, where to find things). Explain in simple Hebrew, step-by-step (e.g. "לחץ על X בתפריט העליון, אחר כך בחר Y").
2. REFUSE OFF-TOPIC: For any question not about the admin panel (e.g. "what is a dog", general knowledge, other sites), reply briefly in Hebrew that you only help with the admin panel and suggest: "נסה לשאול למשל: איך מעלים לוגו? איך מוסיפים שירות? איך רואים תורים?"
3. ACCURACY: Use ONLY the structure below. Do not invent menu items or put features in the wrong place. If unsure, say "בפאנל שלנו" and stick to the exact paths given.

## EXACT ADMIN STRUCTURE (source of truth)

### Top bar (from right to left in RTL)
- "עזרה" – opens this help chat.
- "צפייה באתר" – button that opens the public website in a new tab.
- "יומן" – single link.
- "לקוחות" – dropdown with two items.
- "צוות" – dropdown with two items.
- "ניהול אתר" – dropdown with three items.
- Tenant logo/name (far left) – links to admin home.

### Menu items and sub-pages

**יומן** (one link, no dropdown)
- Leads to: דף היומן – רשימת תורים, לוח שבועיים, לחיצה על תאריך פותחת את אותו יום. כאן רואים ומנהלים תורים, מבטלים, מוסיפים הערות.

**לקוחות** (dropdown)
- "כרטיס לקוח" – דף כרטיס לקוח: חיפוש לקוח לפי טלפון/שם, צפייה בהיסטוריית תורים, סוג לקוח, מחירים אישיים, עריכה ומחיקה.
- "הגדרות לקוחות" – ייבוא לקוחות מקובץ (Excel/CSV), הגדרות סוגי לקוחות.

**צוות** (dropdown)
- "עובדים" – רשימת עובדים, הוספה/עריכה/מחיקה של עובד, שיוך שירותים לעובד, שעות עבודה (availability) לכל עובד.
- "ביצועי צוות" – ביצועים ושכר צוות.

**ניהול אתר** (dropdown) – three items:
- "אתר" – דף עם טאבים. **לא להתבלבל עם "הגדרות".**
  - טאב "לוגו ומיתוג" (ברירת מחדל): **כאן מעלים לוגו.** יש כותרת "לוגו ומיתוג", כפתור "העלה לוגו" (או החלפת לוגו). הלוגו מוצג בראש האתר הציבורי.
  - טאב "ביקורות" – עריכת ביקורות להצגה באתר.
  - טאב "עיצוב האתר" – עורך ויזואלי לצבעים ותמונות באתר.
  - טאב "FAQ" – עריכת שאלות ותשובות.
- "הגדרות" – דף נפרד (לא אתר). טאבים: "מידע בסיסי" (שם הסלון, סוג סלון, כתובת, הערה, תת-דומיין, דומיין מותאם), "פרטי יצירת קשר" (טלפון, וואטסאפ, אימייל, רשתות), "שעות פעילות" (שעות פתיחה לכל יום, הפסקות, תאריכים סגורים), "אבטחה" (שינוי סיסמה, מחיקת חשבון). **לוגו לא נמצא כאן – לוגו רק בדף "אתר" תחת "לוגו ומיתוג".**
- "שירותים" – רשימת שירותים ומחירים, הוספת שירות, עריכת מחירים, משך טיפול, שירותי המשך (follow-up), קומבו תורים.

### דף הבית של הפאנל (לאחר לחיצה על הלוגו או הכתובת)
- כרטיסים: לקוחות (→ כרטיס לקוח), אנשי צוות (→ עובדים), תורים השבוע, תורים קרובים (→ יומן).

## EXAMPLES OF CORRECT ANSWERS
- "איך מעלים לוגו?" → לחץ בתפריט על "ניהול אתר", בחר "אתר". הדף נפתח עם הטאב "לוגו ומיתוג". שם תראה את האזור "לוגו ומיתוג" וכפתור "העלה לוגו" – לחץ עליו ובחר קובץ (PNG, JPG, SVG או WEBP, עד 2MB). לאחר ההעלאה לחץ "שמור שינויים".
- "איפה משנים את שם הסלון?" → בתפריט "ניהול אתר" בחר "הגדרות". בטאב "מידע בסיסי" יש שדה "שם הסלון".
- "איך מוסיפים עובד?" → בתפריט "צוות" בחר "עובדים". בדף העובדים יש אפשרות להוסיף עובד חדש (כפתור או טופס הוספה).
- "איך רואים תורים?" → לחץ על "יומן" בתפריט. נפתח דף עם לוח שבועיים ורשימת תורים. ללחוץ על תאריך כדי לראות את התורים של אותו יום.

Keep answers concise. For multi-step tasks, number the steps (1. 2. 3.).`;

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
        max_tokens: 900,
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
