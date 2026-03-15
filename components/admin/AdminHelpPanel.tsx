"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

const INITIAL_GREETING: ChatMessage = {
  role: "assistant",
  content: "שלום! אני כאן כדי לעזור לך לנווט בפאנל הניהול של Caleno. שאל אותי למשל: איך מעלים לוגו? איך מוסיפים תור? איך מוסיפים עובד?",
};

export function AdminHelpPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { firebaseUser } = useAuth();

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    setError(null);

    try {
      const token = firebaseUser ? await firebaseUser.getIdToken() : null;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/admin/help-chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error || "שגיאה בשליחת השאלה");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "לא הצלחתי לקבל תשובה כרגע. נסה שוב או פנה לתמיכה.",
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.message || "אין תשובה." },
      ]);
    } catch {
      setError("שגיאת רשת");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "אירעה שגיאה. נסה שוב.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-caleno-ink/20 backdrop-blur-sm transition-opacity"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="עזרה – ניווט בפאנל"
        className={cn(
          "fixed top-0 right-0 z-50 flex h-full w-full max-w-[420px] flex-col",
          "rounded-l-[28px] sm:rounded-l-[32px]",
          "border-l border-caleno-200/80",
          "bg-gradient-to-b from-white via-caleno-off/30 to-caleno-50/50",
          "shadow-[-8px_0_32px_rgba(15,23,42,0.08),-4px_0_16px_rgba(30,111,124,0.06)]",
          "ring-1 ring-caleno-100/50 ring-l-0"
        )}
        dir="rtl"
      >
        {/* Header */}
        <div
          className={cn(
            "shrink-0 flex items-center justify-between gap-3 px-5 py-4",
            "rounded-tl-[28px] sm:rounded-tl-[32px]",
            "bg-gradient-to-l from-caleno-50/90 via-white to-white",
            "border-b border-caleno-200/60"
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl",
                "bg-gradient-to-br from-caleno-deep to-caleno-500",
                "text-white shadow-lg shadow-caleno-deep/20",
                "ring-2 ring-white/80"
              )}
            >
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-caleno-ink truncate">
                עזרה (AI)
              </h2>
              <p className="text-xs text-caleno-600/90 truncate">
                ניווט בפאנל
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "shrink-0 rounded-xl p-2.5 transition-all duration-200",
              "text-caleno-600 hover:text-caleno-ink hover:bg-caleno-100/80",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2"
            )}
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 space-y-4 min-h-0"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-start" : "justify-end"
              )}
            >
              <div
                className={cn(
                  "max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  "shadow-sm",
                  msg.role === "user"
                    ? "bg-gradient-to-br from-caleno-deep to-caleno-600 text-white shadow-caleno-deep/15 rounded-br-md"
                    : "bg-white/95 text-caleno-ink border border-caleno-200/70 rounded-bl-md shadow-caleno-100/20"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-end">
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-2xl rounded-bl-md px-4 py-3",
                  "bg-white/95 border border-caleno-200/70",
                  "shadow-sm"
                )}
              >
                <span className="flex gap-1">
                  {[0, 1, 2].map((j) => (
                    <span
                      key={j}
                      className="h-2 w-2 rounded-full bg-caleno-deep/70 animate-bounce"
                      style={{ animationDelay: `${j * 0.15}s` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
          {error && (
            <p
              className="text-xs text-red-600 bg-red-50/80 rounded-xl px-3 py-2 border border-red-200/60"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>

        {/* Input */}
        <div
          className={cn(
            "shrink-0 p-4 pt-3",
            "rounded-bl-[28px] sm:rounded-bl-[32px]",
            "bg-gradient-to-t from-caleno-50/60 via-white to-white",
            "border-t border-caleno-200/60"
          )}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-3 items-end"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל איך לעשות משהו בפאנל..."
              className={cn(
                "flex-1 min-w-0 rounded-2xl border-2 border-caleno-200/80 px-4 py-3 text-sm text-caleno-ink placeholder:text-slate-500",
                "bg-white/90 focus:bg-white",
                "focus:border-caleno-deep focus:outline-none focus:ring-2 focus:ring-caleno-deep/20 focus:ring-offset-0",
                "transition-colors duration-200",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
              disabled={loading}
              aria-label="הודעת עזרה"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className={cn(
                "shrink-0 flex h-12 w-12 items-center justify-center rounded-2xl",
                "bg-gradient-to-br from-caleno-deep to-caleno-600 text-white",
                "shadow-lg shadow-caleno-deep/25 hover:shadow-xl hover:shadow-caleno-deep/30",
                "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                "disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-caleno-deep focus-visible:ring-offset-2"
              )}
              aria-label="שלח"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
