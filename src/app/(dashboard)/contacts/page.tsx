"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Upload,
  Tag,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { ContactEditPanel, type Contact } from "@/components/contact-edit-panel";

type SortField = "first_name" | "phone" | "created_at";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  // Bulk tag modal state
  const [showBulkTag, setShowBulkTag] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagLoading, setBulkTagLoading] = useState(false);

  // Add contact modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    phone: "",
    first_name: "",
    last_name: "",
    email: "",
    tags: "",
  });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const limit = 50;

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      sort: sortField,
      order: sortOrder,
    });
    if (search) params.set("search", search);
    if (activeTags.length > 0) params.set("tags", activeTags.join(","));

    try {
      const res = await fetch(`/api/contacts?${params}`);
      const data = await res.json();
      setContacts(data.contacts || []);
      setTotal(data.total || 0);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [page, search, sortField, sortOrder, activeTags]);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/contacts/tags");
      const data = await res.json();
      setAllTags(data.tags || []);
    } catch {
      // Silently handle
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
    setPage(1);
  }

  function toggleTag(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    setPage(1);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === contacts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  }

  async function handleBulkTag() {
    const tags = bulkTagInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.length === 0) return;

    setBulkTagLoading(true);
    try {
      await fetch("/api/contacts/bulk-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_ids: Array.from(selected),
          tags,
        }),
      });
      setShowBulkTag(false);
      setBulkTagInput("");
      setSelected(new Set());
      fetchContacts();
      fetchTags();
    } catch {
      // Silently handle
    } finally {
      setBulkTagLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} contact(s)? This cannot be undone.`)) return;

    try {
      await fetch("/api/contacts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: Array.from(selected) }),
      });
      setSelected(new Set());
      fetchContacts();
      fetchTags();
    } catch {
      // Silently handle
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddLoading(true);

    const tags = addForm.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: addForm.phone,
          first_name: addForm.first_name || undefined,
          last_name: addForm.last_name || undefined,
          email: addForm.email || undefined,
          tags,
          source: "manual",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add contact");
      }
      setShowAdd(false);
      setAddForm({ phone: "", first_name: "", last_name: "", email: "", tags: "" });
      fetchContacts();
      fetchTags();
    } catch (err) {
      setAddError((err as Error).message);
    } finally {
      setAddLoading(false);
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-0.5" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-0.5" />
    );
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl font-semibold text-primary">
            Contacts
          </h2>
          <p className="text-sm text-secondary mt-1">
            {total} contact{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/contacts/import"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg text-secondary hover:text-primary hover:border-primary/20 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <Upload className="w-4 h-4" />
            Import
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            Add contact
          </button>
        </div>
      </div>

      {/* Tag filter chips */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 ${
                activeTags.includes(tag)
                  ? "bg-accent text-white border-accent"
                  : "bg-panel text-secondary border-border hover:border-accent/40 hover:text-primary"
              }`}
            >
              {tag}
              {activeTags.includes(tag) && (
                <X className="w-3 h-3 inline ml-1" />
              )}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button
              onClick={() => setActiveTags([])}
              className="px-3 py-1 text-xs text-secondary hover:text-primary transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Search and bulk actions */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
          <input
            type="text"
            placeholder="Search by name, phone, or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary">
              {selected.size} selected
            </span>
            <button
              onClick={() => setShowBulkTag(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <Tag className="w-3.5 h-3.5" />
              Tag
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-failed/30 rounded-lg text-failed hover:bg-failed/10 transition-colors focus:outline-none focus:ring-2 focus:ring-failed/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-panel rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-canvas/50">
              <th className="w-10 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={contacts.length > 0 && selected.size === contacts.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
                />
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => toggleSort("first_name")}
                  className="font-medium text-secondary hover:text-primary transition-colors"
                >
                  Name <SortIcon field="first_name" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => toggleSort("phone")}
                  className="font-medium text-secondary hover:text-primary transition-colors"
                >
                  Phone <SortIcon field="phone" />
                </button>
              </th>
              <th className="px-4 py-3 text-left font-medium text-secondary">
                Tags
              </th>
              <th className="px-4 py-3 text-left font-medium text-secondary">
                Status
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  onClick={() => toggleSort("created_at")}
                  className="font-medium text-secondary hover:text-primary transition-colors"
                >
                  Added <SortIcon field="created_at" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-secondary">
                  Loading...
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-secondary">
                    {search || activeTags.length > 0
                      ? "No contacts match your search or filters."
                      : "No contacts yet. Import a list or add one manually to get started."}
                  </p>
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr
                  key={contact.id}
                  onClick={() => setEditContact(contact)}
                  className="border-b border-border last:border-b-0 hover:bg-canvas/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent/30"
                    />
                  </td>
                  <td className="px-4 py-3 text-primary font-medium">
                    {contact.first_name || contact.last_name
                      ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
                      : formatPhone(contact.phone)}
                  </td>
                  <td className="px-4 py-3 text-secondary tabular-nums">
                    {formatPhone(contact.phone)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(contact.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs bg-canvas border border-border rounded-full text-secondary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {contact.opted_out ? (
                      <span className="text-xs font-medium text-failed">
                        Opted out
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-delivered">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-secondary text-xs">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-secondary">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-border rounded-lg text-secondary hover:text-primary disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-border rounded-lg text-secondary hover:text-primary disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Edit side panel */}
      {editContact && (
        <ContactEditPanel
          contact={editContact}
          onClose={() => setEditContact(null)}
          onSaved={(updated) => {
            setContacts((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            );
            setEditContact(null);
            fetchTags();
          }}
        />
      )}

      {/* Bulk tag modal */}
      {showBulkTag && (
        <div className="fixed inset-0 bg-primary/30 flex items-center justify-center z-50">
          <div className="bg-panel rounded-xl border border-border p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-primary mb-4">
              Tag {selected.size} contact{selected.size !== 1 ? "s" : ""}
            </h3>
            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="Enter tags, comma-separated"
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBulkTag(false);
                  setBulkTagInput("");
                }}
                className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkTag}
                disabled={bulkTagLoading || !bulkTagInput.trim()}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
              >
                {bulkTagLoading ? "Tagging..." : "Apply tags"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add contact modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-primary/30 flex items-center justify-center z-50">
          <div className="bg-panel rounded-xl border border-border p-6 w-full max-w-md shadow-lg">
            <h3 className="text-lg font-semibold text-primary mb-4">
              Add contact
            </h3>

            {addError && (
              <div className="mb-4 p-3 bg-failed/10 border border-failed/20 rounded-lg text-sm text-failed">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddContact} className="space-y-3">
              <div>
                <label htmlFor="add-phone" className="block text-sm font-medium text-primary mb-1">
                  Phone number
                </label>
                <input
                  id="add-phone"
                  type="tel"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  required
                  className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="add-first" className="block text-sm font-medium text-primary mb-1">
                    First name
                  </label>
                  <input
                    id="add-first"
                    type="text"
                    value={addForm.first_name}
                    onChange={(e) => setAddForm({ ...addForm, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label htmlFor="add-last" className="block text-sm font-medium text-primary mb-1">
                    Last name
                  </label>
                  <input
                    id="add-last"
                    type="text"
                    value={addForm.last_name}
                    onChange={(e) => setAddForm({ ...addForm, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="add-email" className="block text-sm font-medium text-primary mb-1">
                  Email
                </label>
                <input
                  id="add-email"
                  type="email"
                  value={addForm.email}
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor="add-tags" className="block text-sm font-medium text-primary mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  id="add-tags"
                  type="text"
                  value={addForm.tags}
                  onChange={(e) => setAddForm({ ...addForm, tags: e.target.value })}
                  placeholder="vip, downtown"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdd(false);
                    setAddForm({ phone: "", first_name: "", last_name: "", email: "", tags: "" });
                    setAddError("");
                  }}
                  className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading || !addForm.phone}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
                >
                  {addLoading ? "Adding..." : "Add contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
