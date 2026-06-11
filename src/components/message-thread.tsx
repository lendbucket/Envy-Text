"use client";

import { useEffect, useRef } from "react";
import { Check, CheckCheck, AlertCircle, Clock } from "lucide-react";

interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  media_urls: string[];
  status: string;
  error_code: string | null;
  error_message: string | null;
  segments: number | null;
  estimated_cost: number | null;
  created_at: string;
}

interface Props {
  messages: Message[];
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "queued":
    case "sending":
      return <Clock className="w-3 h-3 text-secondary" />;
    case "sent":
      return <Check className="w-3 h-3 text-secondary" />;
    case "delivered":
      return <CheckCheck className="w-3 h-3 text-delivered" />;
    case "failed":
      return <AlertCircle className="w-3 h-3 text-failed" />;
    default:
      return null;
  }
}

function groupByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const date = new Date(msg.created_at).toDateString();
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

export function MessageThread({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const groups = groupByDate(messages);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {groups.map((group) => (
        <div key={group.date}>
          {/* Day separator */}
          <div className="flex items-center justify-center my-4">
            <span className="px-3 py-1 text-xs text-secondary bg-canvas rounded-full">
              {formatDate(group.date)}
            </span>
          </div>

          {/* Messages */}
          {group.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex mb-2 ${
                msg.direction === "outbound" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[75%] rounded-xl px-3.5 py-2 ${
                  msg.direction === "outbound"
                    ? "bg-accent text-white"
                    : "bg-canvas text-primary border border-border"
                }`}
              >
                {msg.body && (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {msg.body}
                  </p>
                )}

                {msg.media_urls && msg.media_urls.length > 0 && (
                  <div className="mt-1">
                    {msg.media_urls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt="Media"
                        className="max-w-full rounded-lg mt-1 cursor-pointer"
                        onClick={() => window.open(url, "_blank")}
                      />
                    ))}
                  </div>
                )}

                <div
                  className={`flex items-center gap-1 mt-1 ${
                    msg.direction === "outbound" ? "justify-end" : "justify-start"
                  }`}
                >
                  <span
                    className={`text-[10px] ${
                      msg.direction === "outbound"
                        ? "text-white/70"
                        : "text-secondary"
                    }`}
                  >
                    {formatTime(msg.created_at)}
                  </span>
                  {msg.direction === "outbound" && (
                    <StatusIcon status={msg.status} />
                  )}
                </div>

                {msg.status === "failed" && msg.error_message && (
                  <p
                    className={`text-[10px] mt-0.5 ${
                      msg.direction === "outbound"
                        ? "text-white/70"
                        : "text-failed"
                    }`}
                  >
                    Failed: {msg.error_message}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
