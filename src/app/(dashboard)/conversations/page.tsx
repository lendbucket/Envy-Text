"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, MessageSquare, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { MessageThread } from "@/components/message-thread";
import { MessageComposer } from "@/components/message-composer";
import { getSupabaseClient } from "@/lib/supabase/client";

interface Contact {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  tags: string[];
  opted_out: boolean;
  notes: string | null;
}

interface Conversation {
  id: string;
  contact_id: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contacts: Contact;
}

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

function contactName(contact: Contact): string {
  if (contact.first_name || contact.last_name) {
    return `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
  }
  return formatPhone(contact.phone);
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [pricing, setPricing] = useState({
    sms_price_per_segment: 0.0079,
    mms_price: 0.02,
    carrier_fee_per_sms: 0.003,
    carrier_fee_per_mms: 0.01,
  });

  const activeConversation = conversations.find((c) => c.id === activeId);
  const realtimeChannelRef = useRef<ReturnType<ReturnType<typeof getSupabaseClient>["channel"]> | null>(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch pricing once
  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then(setPricing)
      .catch(() => {});
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (unreadOnly) params.set("unread", "true");

    try {
      const res = await fetch(`/api/conversations?${params}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [search, unreadOnly]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Fetch messages for active conversation
  const fetchMessages = useCallback(async () => {
    if (!activeId) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/conversations/${activeId}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      // Silently handle
    } finally {
      setMessagesLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    if (activeId) {
      fetchMessages();
      // Mark as read
      fetch(`/api/conversations/${activeId}/read`, { method: "POST" }).catch(() => {});
      // Update local unread count
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, unread_count: 0 } : c
        )
      );
    } else {
      setMessages([]);
    }
  }, [activeId, fetchMessages]);

  // Supabase Realtime for live updates
  useEffect(() => {
    const supabase = getSupabaseClient();

    // Clean up previous channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel("inbox-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          // If this message belongs to the active conversation, add it
          if (newMsg.conversation_id === activeId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          // Refresh conversation list to update previews and unreads
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const updated = payload.new as Message;
          // Update message status in the thread
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? updated : m))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, fetchConversations]);

  return (
    <div className="flex h-full">
      {/* Left pane: conversation list */}
      <div className={`w-full lg:w-80 border-r border-border bg-panel flex flex-col shrink-0 ${activeId ? "hidden lg:flex" : "flex"}`}>
        {/* Search */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
            <input
              type="text"
              placeholder="Search conversations"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <button
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              unreadOnly
                ? "bg-accent text-white border-accent"
                : "text-secondary border-border hover:border-accent/40"
            }`}
          >
            Unread only
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-secondary">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="w-8 h-8 text-secondary/30 mx-auto mb-2" />
              <p className="text-sm text-secondary">
                {search
                  ? "No conversations match your search."
                  : "No conversations yet. Send a message to get started."}
              </p>
            </div>
          ) : (
            conversations.map((conv) => {
              const contact = conv.contacts;
              const isActive = conv.id === activeId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                    isActive
                      ? "bg-accent/5 border-l-2 border-l-accent"
                      : "hover:bg-canvas/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-medium truncate ${
                            conv.unread_count > 0
                              ? "text-primary"
                              : "text-primary"
                          }`}
                        >
                          {contactName(contact)}
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="shrink-0 w-5 h-5 rounded-full bg-accent text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                            {conv.unread_count > 9
                              ? "9+"
                              : conv.unread_count}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs mt-0.5 truncate ${
                          conv.unread_count > 0
                            ? "text-primary font-medium"
                            : "text-secondary"
                        }`}
                      >
                        {conv.last_message_preview || "No messages"}
                      </p>
                    </div>
                    <span className="text-[10px] text-secondary shrink-0 mt-0.5 tabular-nums">
                      {relativeTime(conv.last_message_at)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right pane: message thread */}
      <div className={`flex-1 flex flex-col bg-panel ${!activeId ? "hidden lg:flex" : "flex"}`}>
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-secondary/20 mx-auto mb-3" />
              <p className="text-secondary text-sm">
                Select a conversation to view messages
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            {activeConversation && (
              <div className="border-b border-border">
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveId(null)}
                      className="lg:hidden p-1 text-secondary hover:text-primary transition-colors rounded-lg"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                    <h3 className="text-sm font-semibold text-primary">
                      {contactName(activeConversation.contacts)}
                    </h3>
                    <p className="text-xs text-secondary tabular-nums">
                      {formatPhone(activeConversation.contacts.phone)}
                    </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowContactInfo(!showContactInfo)}
                    className="flex items-center gap-1 text-xs text-secondary hover:text-primary transition-colors px-2 py-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
                  >
                    Details
                    {showContactInfo ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                </div>

                {/* Contact details panel */}
                {showContactInfo && activeConversation && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-secondary font-medium">Tags</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(activeConversation.contacts.tags || []).length > 0
                            ? activeConversation.contacts.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-0.5 bg-canvas border border-border rounded-full text-secondary"
                                >
                                  {tag}
                                </span>
                              ))
                            : (
                              <span className="text-secondary/50">None</span>
                            )}
                        </div>
                      </div>
                      <div>
                        <span className="text-secondary font-medium">Status</span>
                        <p className="mt-1">
                          {activeConversation.contacts.opted_out ? (
                            <span className="text-failed font-medium">Opted out</span>
                          ) : (
                            <span className="text-delivered font-medium">Active</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-secondary font-medium">Notes</span>
                        <p className="mt-1 text-primary">
                          {activeConversation.contacts.notes || (
                            <span className="text-secondary/50">None</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            {messagesLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-secondary">Loading messages...</p>
              </div>
            ) : (
              <MessageThread messages={messages} />
            )}

            {/* Composer */}
            {activeConversation && (
              <MessageComposer
                conversationId={activeId}
                pricing={pricing}
                disabled={activeConversation.contacts.opted_out}
                onSent={() => {
                  fetchMessages();
                  fetchConversations();
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
