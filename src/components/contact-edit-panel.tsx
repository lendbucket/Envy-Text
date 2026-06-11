"use client";

import { useState, FormEvent } from "react";
import { X } from "lucide-react";
import { formatPhone } from "@/lib/phone";

export interface Contact {
  id: string;
  phone: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  opted_out: boolean;
  opted_out_at: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  contact: Contact;
  onClose: () => void;
  onSaved: (updated: Contact) => void;
}

export function ContactEditPanel({ contact, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    first_name: contact.first_name || "",
    last_name: contact.last_name || "",
    email: contact.email || "",
    phone: contact.phone,
    tags: contact.tags.join(", "),
    notes: contact.notes || "",
    opted_out: contact.opted_out,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          email: form.email || null,
          phone: form.phone,
          tags,
          notes: form.notes || null,
          opted_out: form.opted_out,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      const updated = await res.json();
      onSaved(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-panel border-l border-border shadow-lg z-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h3 className="text-lg font-semibold text-primary">Edit contact</h3>
        <button
          onClick={onClose}
          className="p-1 text-secondary hover:text-primary transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div className="text-xs text-secondary">
          Phone: {formatPhone(contact.phone)} | Source: {contact.source || "unknown"} | Added:{" "}
          {new Date(contact.created_at).toLocaleDateString()}
        </div>

        {error && (
          <div className="p-3 bg-failed/10 border border-failed/20 rounded-lg text-sm text-failed">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-first" className="block text-sm font-medium text-primary mb-1">
              First name
            </label>
            <input
              id="edit-first"
              type="text"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
          <div>
            <label htmlFor="edit-last" className="block text-sm font-medium text-primary mb-1">
              Last name
            </label>
            <input
              id="edit-last"
              type="text"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>
        </div>

        <div>
          <label htmlFor="edit-email" className="block text-sm font-medium text-primary mb-1">
            Email
          </label>
          <input
            id="edit-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="edit-tags" className="block text-sm font-medium text-primary mb-1">
            Tags (comma-separated)
          </label>
          <input
            id="edit-tags"
            type="text"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="vip, downtown, promo-jan"
            className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        <div>
          <label htmlFor="edit-notes" className="block text-sm font-medium text-primary mb-1">
            Notes
          </label>
          <textarea
            id="edit-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary resize-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="edit-opted-out"
            type="checkbox"
            checked={form.opted_out}
            onChange={(e) => setForm({ ...form, opted_out: e.target.checked })}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
          />
          <label htmlFor="edit-opted-out" className="text-sm text-primary">
            Opted out of messaging
          </label>
        </div>
      </form>

      <div className="px-6 py-4 border-t border-border flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-secondary hover:text-primary border border-border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
