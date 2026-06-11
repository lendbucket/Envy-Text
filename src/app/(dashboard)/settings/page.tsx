"use client";

import { useState, useEffect, FormEvent } from "react";
import { Copy, Check } from "lucide-react";

interface SettingsData {
  sms_price_per_segment: string;
  mms_price: string;
  carrier_fee_per_sms: string;
  carrier_fee_per_mms: string;
  test_phone_number: string;
  twilio_phone_number: string;
  webhook_url: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings(data);
    } catch {
      setError("Failed to load settings. Check your Supabase connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sms_price_per_segment: settings.sms_price_per_segment,
          mms_price: settings.mms_price,
          carrier_fee_per_sms: settings.carrier_fee_per_sms,
          carrier_fee_per_mms: settings.carrier_fee_per_mms,
          test_phone_number: settings.test_phone_number,
        }),
      });

      if (!res.ok) throw new Error("Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save settings. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function copyWebhookUrl() {
    if (!settings) return;
    navigator.clipboard.writeText(settings.webhook_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function updateField(field: keyof SettingsData, value: string) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-secondary text-sm">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h2 className="font-display text-2xl font-semibold text-primary mb-8">
        Settings
      </h2>

      {error && (
        <div className="mb-6 p-4 bg-failed/10 border border-failed/20 rounded-xl text-sm text-failed">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Twilio */}
        <section className="bg-panel rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Twilio
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Sending number
              </label>
              <p className="text-sm text-secondary tabular-nums">
                {settings?.twilio_phone_number || "Not configured"}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary mb-1">
                Inbound webhook URL
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm text-secondary bg-canvas px-3 py-2 rounded-lg border border-border truncate">
                  {settings?.webhook_url || "Not available"}
                </code>
                <button
                  type="button"
                  onClick={copyWebhookUrl}
                  className="p-2 text-secondary hover:text-primary transition-colors"
                  title="Copy webhook URL"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-delivered" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-secondary mt-1">
                Paste this URL into your Twilio phone number webhook settings
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-panel rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Pricing
          </h3>
          <p className="text-xs text-secondary mb-4">
            These values are used to calculate cost estimates before sends. Update them if your Twilio pricing changes.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="sms_price"
                className="block text-sm font-medium text-primary mb-1"
              >
                SMS per segment
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">
                  $
                </span>
                <input
                  id="sms_price"
                  type="text"
                  inputMode="decimal"
                  value={settings?.sms_price_per_segment || ""}
                  onChange={(e) =>
                    updateField("sms_price_per_segment", e.target.value)
                  }
                  className="w-full pl-7 pr-3 py-2 border border-border rounded-lg bg-panel text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="mms_price"
                className="block text-sm font-medium text-primary mb-1"
              >
                MMS per message
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">
                  $
                </span>
                <input
                  id="mms_price"
                  type="text"
                  inputMode="decimal"
                  value={settings?.mms_price || ""}
                  onChange={(e) => updateField("mms_price", e.target.value)}
                  className="w-full pl-7 pr-3 py-2 border border-border rounded-lg bg-panel text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="carrier_sms"
                className="block text-sm font-medium text-primary mb-1"
              >
                Carrier fee per SMS
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">
                  $
                </span>
                <input
                  id="carrier_sms"
                  type="text"
                  inputMode="decimal"
                  value={settings?.carrier_fee_per_sms || ""}
                  onChange={(e) =>
                    updateField("carrier_fee_per_sms", e.target.value)
                  }
                  className="w-full pl-7 pr-3 py-2 border border-border rounded-lg bg-panel text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="carrier_mms"
                className="block text-sm font-medium text-primary mb-1"
              >
                Carrier fee per MMS
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">
                  $
                </span>
                <input
                  id="carrier_mms"
                  type="text"
                  inputMode="decimal"
                  value={settings?.carrier_fee_per_mms || ""}
                  onChange={(e) =>
                    updateField("carrier_fee_per_mms", e.target.value)
                  }
                  className="w-full pl-7 pr-3 py-2 border border-border rounded-lg bg-panel text-primary tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Test phone */}
        <section className="bg-panel rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
            Test sends
          </h3>

          <div>
            <label
              htmlFor="test_phone"
              className="block text-sm font-medium text-primary mb-1"
            >
              Your phone number
            </label>
            <input
              id="test_phone"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={settings?.test_phone_number || ""}
              onChange={(e) => updateField("test_phone_number", e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary tabular-nums placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
            <p className="text-xs text-secondary mt-1">
              Used for "Send test to my number" on campaign compose
            </p>
          </div>
        </section>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
          >
            {saving ? "Saving..." : "Save settings"}
          </button>

          {saved && (
            <span className="text-sm text-delivered font-medium">
              Settings saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
