"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/conversations");
        return;
      }

      const data = await res.json();
      setError(data.error || "Incorrect password");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas">
      <div className="w-full max-w-sm">
        <div className="bg-panel rounded-xl shadow-sm border border-border p-8">
          <h1 className="font-display text-2xl font-semibold text-primary text-center mb-2">
            Envy Texts
          </h1>
          <p className="text-secondary text-sm text-center mb-8">
            Salon Envy USA internal messaging
          </p>

          <form onSubmit={handleSubmit}>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-primary mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              placeholder="Enter password"
              autoFocus
              required
            />

            {error && (
              <p className="mt-2 text-sm text-failed">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="mt-4 w-full py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
