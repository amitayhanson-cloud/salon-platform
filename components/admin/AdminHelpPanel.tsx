"use client";

import { useState, useRef, useEffect } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

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
        className="fixed inset-0 z-40 bg-black/30"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="עזרה – ניווט בפאנל"
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-r border-[#E2E8F0] bg-white shadow-xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#1E6F7C]" />
            <h2 className="text-lg font-semibold text-[#0F172A]">עזרה</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            aria-label="סגור"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-[#1E6F7C] text-white"
                    : "bg-[#F1F5F9] text-[#0F172A]"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-end">
              <div className="rounded-2xl bg-[#F1F5F9] px-4 py-2.5 text-sm text-[#64748B]">
                ...
              </div>
            </div>
          )}
          {error && (
            <p className="text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-[#E2E8F0] p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל איך לעשות משהו בפאנל..."
              className="flex-1 rounded-lg border border-[#E2E8F0] bg-white px-4 py-2.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1E6F7C] focus:outline-none focus:ring-1 focus:ring-[#1E6F7C]"
              disabled={loading}
              aria-label="הודעת עזרה"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-[#1E6F7C] p-2.5 text-white transition-colors hover:bg-[#1a6370] disabled:opacity-50 disabled:hover:bg-[#1E6F7C]"
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
