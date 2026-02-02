"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface AccordionItemProps {
  title: string | React.ReactNode;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}

export function AccordionItem({ title, children, isOpen, onToggle }: AccordionItemProps) {
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-6 py-4 text-right hover:bg-slate-50 transition-colors">
        <div 
          className="flex-1 text-right cursor-pointer"
          onClick={onToggle}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggle();
            }
          }}
          aria-label={isOpen ? "סגור" : "פתח"}
        >
          {typeof title === "string" ? (
            <span className="text-sm font-semibold text-slate-900">{title}</span>
          ) : (
            title
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-slate-100 rounded transition-colors flex-shrink-0"
          aria-label={isOpen ? "סגור" : "פתח"}
        >
          <ChevronDown
            className={`w-5 h-5 text-slate-600 transition-transform duration-300 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-6 py-4 border-t border-slate-100">{children}</div>
      </div>
    </div>
  );
}

interface AccordionProps {
  items: Array<{
    id: string;
    title: string;
    content: React.ReactNode;
  }>;
  defaultOpen?: string | null;
}

export function Accordion({ items, defaultOpen = null }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen);

  const handleToggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <AccordionItem
          key={item.id}
          title={item.title}
          isOpen={openId === item.id}
          onToggle={() => handleToggle(item.id)}
        >
          {item.content}
        </AccordionItem>
      ))}
    </div>
  );
}
