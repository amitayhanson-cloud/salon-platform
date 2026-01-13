import { NextRequest, NextResponse } from "next/server";
import type { SiteConfig } from "@/types/siteConfig";
import type { GeneratedContent } from "@/types/generatedContent";

export async function POST(req: NextRequest) {
  try {
    const config = (await req.json()) as SiteConfig;

    // simple validation
    if (!config.salonName || !config.city) {
      return NextResponse.json(
        { error: "Missing salonName or city" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500 }
      );
    }

    const prompt = buildPrompt(config);

    const openAiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "אתה כותב תוכן שיווקי לאתרי סלון. תחזיר תמיד JSON תקין בלבד לפי המבנה שהמפתח הגדיר.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      }
    );

    if (!openAiResponse.ok) {
      const text = await openAiResponse.text();
      console.error("OpenAI error:", text);
      return NextResponse.json(
        { error: "Failed to generate content" },
        { status: 500 }
      );
    }

    const data = await openAiResponse.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { error: "No content from model" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(rawContent) as GeneratedContent;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("generate-site-content error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

function buildPrompt(config: SiteConfig): string {
  return `
אתה בונה תוכן מלא לאתר של סלון.

פרטי הסלון:
- שם: ${config.salonName || ""}
- סוג סלון: ${config.salonType || ""}
- עיר: ${config.city || ""}
- שכונה: ${config.neighborhood || ""}
- מטרות עיקריות: ${config.mainGoals?.join(", ") || "אין"}
- שירותים: ${config.services?.join(", ") || "אין"}
- אפשרויות יצירת קשר: ${config.contactOptions?.join(", ") || "אין"}
- עמודים נוספים: ${config.extraPages?.join(", ") || "אין"}
- הערה מיוחדת מהבעלים: ${config.specialNote || "אין"}

דרישות:
- שפה: עברית.
- טון: חם, מקצועי, פשוט.
- קהל: לקוחות מקומיים בעיר.

החזר JSON בלבד במבנה הבא (אל תוסיף טקסט חוץ מה-JSON):

{
  "hero": {
    "headline": string,
    "subheadline": string,
    "primaryCtaLabel": string
  },
  "about": {
    "title": string,
    "paragraph": string,
    "bullets": string[]
  },
  "services": {
    "title": string,
    "intro": string,
    "items": [
      {
        "name": string,
        "description": string,
        "icon": string
      }
    ]
  },
  "gallery": {
    "title": string,
    "description": string,
    "imagePrompts": string[]
  },
  "contact": {
    "title": string,
    "paragraph": string
  },
  "seo": {
    "pageTitle": string,
    "metaDescription": string
  },
  "theme": {
    "primary": "sky" | "emerald" | "rose" | "violet" | "slate",
    "accent": "amber" | "cyan" | "pink" | "indigo" | null
  }
}
`;
}
