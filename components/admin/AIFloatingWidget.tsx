"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  kind?: "text" | "schedule" | "revenue" | "booking_created" | "need_clarification";
  data?: any;
  isLarge?: boolean;
  pdfPayload?: {
    title: string;
    type: "schedule" | "revenue" | "generic";
    data: any;
  };
};

type AIFloatingWidgetProps = {
  siteId: string;
};

export default function AIFloatingWidget({ siteId }: AIFloatingWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load messages from sessionStorage when widget opens
  useEffect(() => {
    if (isOpen) {
      const stored = sessionStorage.getItem(`aiChat:${siteId}`);
      if (stored) {
        try {
          setMessages(JSON.parse(stored));
        } catch (err) {
          console.error("Failed to load chat history:", err);
        }
      }
    }
  }, [isOpen, siteId]);

  // Save messages to sessionStorage
  useEffect(() => {
    if (isOpen && messages.length > 0) {
      sessionStorage.setItem(`aiChat:${siteId}`, JSON.stringify(messages));
    }
  }, [messages, siteId, isOpen]);

  // Clear chat when widget closes
  const handleClose = () => {
    setIsOpen(false);
    setMessages([]);
    setStreamingText("");
    sessionStorage.removeItem(`aiChat:${siteId}`);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Check for siteId
    if (!siteId || typeof siteId !== "string" || siteId.trim() === "") {
      console.error("[AIFloatingWidget] Missing siteId:", siteId);
      const errorMessage: Message = {
        role: "assistant",
        content: "חסר siteId לאתר הזה, לא ניתן להפעיל את ה-AI.",
      };
      setMessages([...messages, errorMessage]);
      return;
    }

    const userMessage: Message = {
      role: "user",
      content: text.trim(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setStreamingText("");

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      console.log("[AIFloatingWidget] sending message", { siteId, message: text.trim() });
      const response = await fetch("/api/admin-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      // Handle non-OK responses with detailed error
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[AI] /api/admin-ai failed", {
          status: response.status,
          statusText: response.statusText,
          text: errorText.slice(0, 800),
        });
        const errorMsg = errorText.slice(0, 200);
        throw new Error(`AI API failed (${response.status}): ${errorMsg}`);
      }

      // Check if response body exists
      if (!response.body) {
        throw new Error("AI API returned no response body");
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let finalKind: Message["kind"];
      let finalData: any;
      let finalPdfPayload: any;
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Split by "\n\n" (SSE message separator)
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || ""; // Keep incomplete block in buffer

          for (const block of blocks) {
            const lines = block.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const dataStr = line.slice(6).trim();
                if (dataStr === "[DONE]" || !dataStr) continue;
                
                try {
                  const payload = JSON.parse(dataStr);
                  
                  // Handle streaming text
                  if (payload.text !== undefined) {
                    fullText += payload.text;
                    setStreamingText(fullText);
                  }
                  
                  // Handle completion
                  if (payload.done === true) {
                    finalKind = payload.kind as Message["kind"];
                    finalData = payload.data;
                    if (payload.isLarge && payload.data) {
                      finalPdfPayload = payload.pdfPayload;
                    }
                    break;
                  }
                } catch (parseErr) {
                  console.warn("[AI] Failed to parse SSE data:", dataStr, parseErr);
                }
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Create final assistant message
      const assistantMessage: Message = {
        role: "assistant",
        content: fullText || "לא התקבלה תשובה.",
        kind: finalKind,
        data: finalData,
        isLarge: finalPdfPayload ? true : undefined,
        pdfPayload: finalPdfPayload,
      };
      setMessages([...newMessages, assistantMessage]);
      setStreamingText("");
    } catch (err: any) {
      if (err.name === "AbortError") {
        return; // User cancelled
      }
      
      // Log full error with stack
      console.error("[AI] Error sending message:", err);
      console.error("[AI] Error stack:", err.stack);
      
      // Show detailed error in UI
      const errorMessage: Message = {
        role: "assistant",
        content: `שגיאה בקבלת תשובה מהשרת: ${err.message || String(err)}`,
      };
      setMessages([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
      setStreamingText("");
      abortControllerRef.current = null;
    }
  };

  const handleSend = () => {
    sendMessage(input);
  };

  const handleQuickAction = (action: string) => {
    const prompts: Record<string, string> = {
      schedule: "הצג את לוח הזמנים של היום",
      booking: "צור תור חדש",
      revenue: "הצג את ההכנסות החודשיות",
    };
    setInput(prompts[action] || "");
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleExportPDF = async (pdfPayload: Message["pdfPayload"]) => {
    if (!pdfPayload) return;

    try {
      const response = await fetch("/api/admin-ai/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          payload: pdfPayload,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pdfPayload.title.replace(/[^a-zA-Z0-9\u0590-\u05FF\s]/g, "_")}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error exporting PDF:", err);
      alert("שגיאה ביצירת ה-PDF");
    }
  };

  const formatMessageContent = (message: Message) => {
    if (message.kind === "schedule" && Array.isArray(message.data)) {
      return (
        <div className="space-y-2">
          <p className="font-semibold mb-2">לוח זמנים{message.data[0]?.date ? ` - ${message.data[0].date}` : ""}:</p>
          {message.data.length === 0 ? (
            <p className="text-sm">אין תורים לתאריך זה.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {message.data.map((item: any, idx: number) => (
                <div key={idx} className="border-b border-slate-200 dark:border-slate-700 pb-2 last:border-0">
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-slate-900 dark:text-slate-100 min-w-[60px]">{item.time}</span>
                    <div className="flex-1">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{item.serviceName}</div>
                      {item.workerName && (
                        <div className="text-xs text-slate-600 dark:text-slate-400">עובד: {item.workerName}</div>
                      )}
                      <div className="text-slate-700 dark:text-slate-300">{item.customerName}</div>
                      {item.phone && (
                        <div className="text-xs text-slate-500 dark:text-slate-500">{item.phone}</div>
                      )}
                      {item.price > 0 && (
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">₪{item.price}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (message.kind === "revenue" && message.data) {
      return (
        <div className="space-y-2">
          <p className="font-semibold mb-2">הכנסות חודשיות:</p>
          <p>חודש: {message.data.monthLabel}</p>
          <p>סה"כ תורים: {message.data.countBookings}</p>
          <p className="font-bold text-lg">סה"כ הכנסות: ₪{message.data.totalRevenue}</p>
        </div>
      );
    }

    if (message.kind === "booking_created" && message.data) {
      return (
        <div className="space-y-2">
          <p className="font-semibold text-green-600">✓ תור נוצר בהצלחה!</p>
          <p>לקוח: {message.data.customerName}</p>
          <p>שירות: {message.data.serviceName}</p>
          <p>תאריך: {new Date(message.data.startAt).toLocaleDateString("he-IL")}</p>
        </div>
      );
    }

    if (message.kind === "need_clarification" && message.data?.options) {
      return (
        <div className="space-y-2">
          <p>{message.content}</p>
          <div className="flex flex-wrap gap-2">
            {message.data.options.map((opt: any) => (
              <button
                key={opt.id}
                onClick={() => sendMessage(`עובד: ${opt.name}`)}
                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 rounded text-sm"
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      );
    }

    return <p>{message.content}</p>;
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed left-4 bottom-6 z-50 w-14 h-14 lg:w-16 lg:h-16 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95"
        style={{
          backgroundColor: "var(--primary)",
          color: "var(--primaryText)",
        }}
        aria-label="פתח AI"
      >
        <svg
          className="w-6 h-6 lg:w-7 lg:h-7"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </button>

      {/* Chat Card */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col",
            "left-4 bottom-24",
            "w-[calc(100vw-32px)] lg:w-96",
            "lg:h-[600px] h-[calc(100vh-120px)]",
            "rounded-2xl shadow-xl",
            "border border-slate-200 dark:border-slate-700",
            "bg-white dark:bg-slate-900"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 rounded-t-2xl bg-white dark:bg-slate-900">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              AI עוזר
            </h3>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              aria-label="סגור"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quick Action Chips */}
          <div className="px-4 pt-3 pb-2 flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <button
              onClick={() => handleQuickAction("schedule")}
              className="px-3 py-1 text-xs rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
            >
              לוח זמנים היום
            </button>
            <button
              onClick={() => handleQuickAction("booking")}
              className="px-3 py-1 text-xs rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
            >
              צור תור
            </button>
            <button
              onClick={() => handleQuickAction("revenue")}
              className="px-3 py-1 text-xs rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
            >
              הכנסות חודשיות
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white dark:bg-slate-900">
            {messages.length === 0 && !isLoading && (
              <div className="text-center text-sm text-slate-600 dark:text-slate-400">
                <p>שלום! איך אוכל לעזור?</p>
                <p className="mt-2 text-xs">אני יכול לענות על שאלות על הסלון, להציג לוח זמנים, ליצור תור, או להציג הכנסות.</p>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3 text-sm",
                    msg.role === "user"
                      ? "rounded-br-none bg-sky-600 text-white"
                      : "rounded-bl-none bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  )}
                >
                  {formatMessageContent(msg)}
                  {msg.isLarge && msg.pdfPayload && (
                    <button
                      onClick={() => handleExportPDF(msg.pdfPayload)}
                      className="mt-2 px-3 py-1 bg-white text-blue-600 rounded text-xs hover:bg-gray-100"
                    >
                      ייצא PDF
                    </button>
                  )}
                </div>
              </div>
            ))}
            {isLoading && streamingText && (
              <div className="flex justify-start">
                <div className="rounded-lg p-3 text-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 max-w-[80%]">
                  <p>{streamingText}</p>
                  <span className="inline-block w-2 h-4 bg-slate-600 dark:bg-slate-400 animate-pulse ml-1" />
                </div>
              </div>
            )}
            {isLoading && !streamingText && (
              <div className="flex justify-start">
                <div className="rounded-lg p-3 text-sm bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100">
                  <span className="animate-pulse">מחשב...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl bg-white dark:bg-slate-900">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="הקלד הודעה..."
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                dir="rtl"
                disabled={isLoading}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                שלח
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
