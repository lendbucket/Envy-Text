"use client";

import { useState, useRef } from "react";
import { ImageIcon, X, Loader2 } from "lucide-react";
import imageCompression from "browser-image-compression";

interface Props {
  onUploaded: (url: string) => void;
  currentUrl?: string | null;
  onRemove?: () => void;
}

const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.6,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

export function ImageUpload({ onUploaded, currentUrl, onRemove }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError("");
    const allowed = ["image/jpeg", "image/png", "image/gif"];
    if (!allowed.includes(file.type)) {
      setError("Only JPEG, PNG, and GIF files are accepted.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds the 5MB limit.");
      return;
    }

    setUploading(true);
    try {
      // Compress before upload
      const compressed = await imageCompression(file, COMPRESSION_OPTIONS);

      const formData = new FormData();
      formData.append("file", compressed, file.name);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      onUploaded(data.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  }

  if (currentUrl) {
    return (
      <div className="relative inline-block">
        <img
          src={currentUrl}
          alt="Attached"
          className="w-20 h-20 object-cover rounded-lg border border-border"
        />
        {onRemove && (
          <button
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-failed text-white rounded-full flex items-center justify-center text-xs hover:bg-failed/80 focus:outline-none"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg text-secondary hover:text-primary transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <ImageIcon className="w-3.5 h-3.5" />
        )}
        {uploading ? "Compressing..." : "Attach image"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        onChange={handleInputChange}
        className="sr-only"
      />
      {error && <p className="text-xs text-failed mt-1">{error}</p>}
    </div>
  );
}
