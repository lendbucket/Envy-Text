"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { analyzeMessage } from "@/lib/sms/segments";

interface Props {
  conversationId: string;
  pricing: {
    sms_price_per_segment: number;
    mms_price: number;
    carrier_fee_per_sms: number;
    carrier_fee_per_mms: number;
  };
  disabled?: boolean;
  onSent: () => void;
}

export function MessageComposer({ conversationId, pricing, disabled, onSent }: Props) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const segmentInfo = analyzeMessage(body, false);

  let costPerMessage = 0;
  if (segmentInfo.segmentCount > 0) {
    costPerMessage =
      segmentInfo.segmentCount * pricing.sms_price_per_segment +
      segmentInfo.segmentCount * pricing.carrier_fee_per_sms;
  }

  async function handleSend() {
    if (!body.trim() || sending || disabled) return;
    setSending(true);

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          body: body.trim(),
        }),
      });

      if (res.ok) {
        setBody("");
        onSent();
        // Refocus textarea
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    } catch {
      // Silently handle
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-border bg-panel px-4 py-3">
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled || sending}
            rows={2}
            className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm resize-none placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent disabled:opacity-50"
          />
          <div className="flex items-center justify-between mt-1 px-1">
            <div className="flex items-center gap-3 text-xs text-secondary tabular-nums">
              <span>{segmentInfo.charCount} chars</span>
              <span>{segmentInfo.encoding}</span>
              <span>
                {segmentInfo.segmentCount} segment{segmentInfo.segmentCount !== 1 ? "s" : ""}
              </span>
            </div>
            {costPerMessage > 0 && (
              <span className="text-xs text-secondary tabular-nums">
                ~${costPerMessage.toFixed(4)}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleSend}
          disabled={!body.trim() || sending || disabled}
          className="p-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 shrink-0"
          title="Send (Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {disabled && (
        <p className="text-xs text-failed mt-1 px-1">
          This contact has opted out of messaging.
        </p>
      )}
    </div>
  );
}
