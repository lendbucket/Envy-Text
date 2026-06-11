"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, ArrowLeft, FileSpreadsheet, Check, AlertTriangle } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { normalizePhone } from "@/lib/phone";

type Step = "upload" | "mapping" | "review" | "importing" | "result";

interface ParsedRow {
  [key: string]: string;
}

interface MappedContact {
  phone: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface ValidationResult {
  valid: MappedContact[];
  invalid: { row: number; reason: string; data: ParsedRow }[];
  duplicatesInFile: { row: number; phone: string }[];
  alreadyInDb: string[];
}

const FIELD_OPTIONS = [
  { value: "", label: "-- Skip --" },
  { value: "phone", label: "Phone" },
  { value: "first_name", label: "First name" },
  { value: "last_name", label: "Last name" },
  { value: "email", label: "Email" },
];

function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};

  for (const header of headers) {
    const lower = header.toLowerCase().trim();

    if (/^(phone|mobile|cell|telephone|tel|number)/.test(lower)) {
      mapping[header] = "phone";
    } else if (/^(first.?name|fname|first)$/.test(lower)) {
      mapping[header] = "first_name";
    } else if (/^(last.?name|lname|last|surname)$/.test(lower)) {
      mapping[header] = "last_name";
    } else if (/^(name|full.?name)$/.test(lower)) {
      mapping[header] = "first_name";
    } else if (/^(email|e-mail|email.?address)$/.test(lower)) {
      mapping[header] = "email";
    }
  }

  return mapping;
}

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [tags, setTags] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback((file: File) => {
    setError("");
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0 && results.data.length === 0) {
            setError("Could not parse CSV. Check the file format.");
            return;
          }
          const data = results.data as ParsedRow[];
          const cols = results.meta.fields || [];
          setRawRows(data);
          setHeaders(cols);
          setMapping(autoDetectMapping(cols));
          setStep("mapping");
        },
        error: () => {
          setError("Failed to parse CSV file.");
        },
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, {
            defval: "",
          });
          if (json.length === 0) {
            setError("Spreadsheet is empty or has no data rows.");
            return;
          }
          const cols = Object.keys(json[0]);
          setRawRows(json);
          setHeaders(cols);
          setMapping(autoDetectMapping(cols));
          setStep("mapping");
        } catch {
          setError("Failed to parse spreadsheet. Make sure it is a valid .xlsx or .xls file.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      setError("Unsupported file type. Use .csv, .xlsx, or .xls files.");
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function updateMapping(header: string, field: string) {
    setMapping((prev) => {
      const next = { ...prev };
      // Clear any other header mapped to this field (except "skip")
      if (field) {
        for (const key of Object.keys(next)) {
          if (next[key] === field && key !== header) {
            next[key] = "";
          }
        }
      }
      next[header] = field;
      return next;
    });
  }

  function hasPhoneMapping(): boolean {
    return Object.values(mapping).includes("phone");
  }

  async function runValidation() {
    setError("");

    const phoneHeader = Object.entries(mapping).find(([, v]) => v === "phone")?.[0];
    const firstNameHeader = Object.entries(mapping).find(([, v]) => v === "first_name")?.[0];
    const lastNameHeader = Object.entries(mapping).find(([, v]) => v === "last_name")?.[0];
    const emailHeader = Object.entries(mapping).find(([, v]) => v === "email")?.[0];

    if (!phoneHeader) {
      setError("Phone column is required.");
      return;
    }

    const valid: MappedContact[] = [];
    const invalid: ValidationResult["invalid"] = [];
    const seenPhones = new Map<string, number>();
    const duplicatesInFile: ValidationResult["duplicatesInFile"] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rawPhone = String(row[phoneHeader] || "").trim();

      if (!rawPhone) {
        invalid.push({ row: i + 2, reason: "Empty phone number", data: row });
        continue;
      }

      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        invalid.push({
          row: i + 2,
          reason: `Invalid phone number: ${rawPhone}`,
          data: row,
        });
        continue;
      }

      if (seenPhones.has(normalized)) {
        duplicatesInFile.push({ row: i + 2, phone: normalized });
        continue;
      }
      seenPhones.set(normalized, i + 2);

      valid.push({
        phone: normalized,
        first_name: firstNameHeader ? String(row[firstNameHeader] || "").trim() : "",
        last_name: lastNameHeader ? String(row[lastNameHeader] || "").trim() : "",
        email: emailHeader ? String(row[emailHeader] || "").trim() : "",
      });
    }

    // Check which phones already exist in the database
    let alreadyInDb: string[] = [];
    if (valid.length > 0) {
      try {
        const phones = valid.map((c) => c.phone);
        // Check in batches of 200
        for (let i = 0; i < phones.length; i += 200) {
          const batch = phones.slice(i, i + 200);
          const res = await fetch("/api/contacts?" + new URLSearchParams({
            search: "",
            limit: "10000",
          }));
          if (res.ok) {
            const data = await res.json();
            const dbPhones = new Set(
              (data.contacts || []).map((c: { phone: string }) => c.phone)
            );
            for (const phone of batch) {
              if (dbPhones.has(phone)) {
                alreadyInDb.push(phone);
              }
            }
            break; // Only need one fetch since we got all contacts
          }
        }
      } catch {
        // Non-fatal, just skip the DB check
      }
    }

    setValidation({ valid, invalid, duplicatesInFile, alreadyInDb });
    setStep("review");
  }

  async function commitImport() {
    if (!validation) return;
    setStep("importing");
    setError("");

    const importTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacts: validation.valid,
          tags: importTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Import failed");
      }

      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch (err) {
      setError((err as Error).message);
      setStep("review");
    }
  }

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => router.push("/contacts")}
          className="p-2 text-secondary hover:text-primary transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-display text-2xl font-semibold text-primary">
            Import contacts
          </h2>
          <p className="text-sm text-secondary mt-1">
            Upload a CSV or Excel file to add contacts in bulk
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-failed/10 border border-failed/20 rounded-xl text-sm text-failed">
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
            dragOver
              ? "border-accent bg-accent/5"
              : "border-border hover:border-accent/40"
          }`}
        >
          <Upload className="w-10 h-10 text-secondary mx-auto mb-4" />
          <p className="text-primary font-medium mb-1">
            Drag and drop your file here
          </p>
          <p className="text-sm text-secondary mb-4">
            Supports .csv, .xlsx, and .xls files
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-accent/30 focus-within:ring-offset-2">
            <FileSpreadsheet className="w-4 h-4" />
            Browse files
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileInput}
              className="sr-only"
            />
          </label>
        </div>
      )}

      {/* Step 2: Column mapping */}
      {step === "mapping" && (
        <div className="space-y-6">
          <div className="bg-panel rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide">
                Column mapping
              </h3>
              <span className="text-xs text-secondary">
                {fileName} - {rawRows.length} row{rawRows.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-sm text-secondary mb-4">
              Map your spreadsheet columns to contact fields. Phone is required.
            </p>

            <div className="space-y-3">
              {headers.map((header) => (
                <div
                  key={header}
                  className="flex items-center gap-4"
                >
                  <span className="w-48 text-sm text-primary font-medium truncate">
                    {header}
                  </span>
                  <span className="text-secondary text-sm">maps to</span>
                  <select
                    value={mapping[header] || ""}
                    onChange={(e) => updateMapping(header, e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Preview first 3 rows */}
            {rawRows.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <p className="text-xs text-secondary mb-2">Preview (first 3 rows)</p>
                <div className="overflow-x-auto">
                  <table className="text-xs text-secondary w-full">
                    <thead>
                      <tr>
                        {headers.map((h) => (
                          <th key={h} className="px-2 py-1 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rawRows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          {headers.map((h) => (
                            <td key={h} className="px-2 py-1 truncate max-w-[120px]">
                              {String(row[h] || "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="bg-panel rounded-xl border border-border p-6">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">
              Batch tags
            </h3>
            <p className="text-sm text-secondary mb-3">
              Apply tags to every contact in this import. Use this to segment your lists.
            </p>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. vip, downtown-location, promo-june"
              className="w-full px-3 py-2 border border-border rounded-lg bg-panel text-primary text-sm placeholder:text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setStep("upload");
                setRawRows([]);
                setHeaders([]);
                setMapping({});
              }}
              className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              Back
            </button>
            <button
              onClick={runValidation}
              disabled={!hasPhoneMapping()}
              className="px-6 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
            >
              Validate and review
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Validation review */}
      {step === "review" && validation && (
        <div className="space-y-6">
          <div className="bg-panel rounded-xl border border-border p-6">
            <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-4">
              Validation summary
            </h3>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="text-center p-4 bg-canvas rounded-lg">
                <p className="text-2xl font-semibold text-delivered tabular-nums">
                  {validation.valid.length}
                </p>
                <p className="text-xs text-secondary mt-1">Valid</p>
              </div>
              <div className="text-center p-4 bg-canvas rounded-lg">
                <p className="text-2xl font-semibold text-failed tabular-nums">
                  {validation.invalid.length}
                </p>
                <p className="text-xs text-secondary mt-1">Invalid</p>
              </div>
              <div className="text-center p-4 bg-canvas rounded-lg">
                <p className="text-2xl font-semibold text-scheduled tabular-nums">
                  {validation.duplicatesInFile.length}
                </p>
                <p className="text-xs text-secondary mt-1">Duplicates in file</p>
              </div>
              <div className="text-center p-4 bg-canvas rounded-lg">
                <p className="text-2xl font-semibold text-secondary tabular-nums">
                  {validation.alreadyInDb.length}
                </p>
                <p className="text-xs text-secondary mt-1">Already in database</p>
              </div>
            </div>

            {validation.alreadyInDb.length > 0 && (
              <p className="text-xs text-secondary mt-3">
                Existing contacts will have empty fields filled in and tags merged. Manual edits are never overwritten.
              </p>
            )}
          </div>

          {/* Invalid rows detail */}
          {validation.invalid.length > 0 && (
            <div className="bg-panel rounded-xl border border-border p-6">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-failed" />
                Invalid rows ({validation.invalid.length})
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {validation.invalid.map((inv, i) => (
                  <div
                    key={i}
                    className="text-xs text-secondary flex gap-2"
                  >
                    <span className="text-failed font-medium tabular-nums">
                      Row {inv.row}:
                    </span>
                    <span>{inv.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tags && (
            <div className="text-sm text-secondary">
              Tags to apply:{" "}
              {tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((t) => (
                  <span
                    key={t}
                    className="inline-block px-2 py-0.5 text-xs bg-canvas border border-border rounded-full text-secondary mx-0.5"
                  >
                    {t}
                  </span>
                ))}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setStep("mapping")}
              className="px-4 py-2 text-sm border border-border rounded-lg text-secondary hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              Back to mapping
            </button>
            <button
              onClick={commitImport}
              disabled={validation.valid.length === 0}
              className="px-6 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
            >
              Import {validation.valid.length} contact{validation.valid.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* Step 3.5: Importing progress */}
      {step === "importing" && (
        <div className="bg-panel rounded-xl border border-border p-12 text-center">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-primary font-medium">Importing contacts...</p>
          <p className="text-sm text-secondary mt-1">
            Processing {validation?.valid.length || 0} contacts in chunks
          </p>
        </div>
      )}

      {/* Step 4: Result */}
      {step === "result" && result && (
        <div className="bg-panel rounded-xl border border-border p-8 text-center">
          <div className="w-12 h-12 bg-delivered/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-6 h-6 text-delivered" />
          </div>
          <h3 className="text-lg font-semibold text-primary mb-2">
            Import complete
          </h3>

          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mt-6 mb-6">
            <div className="text-center">
              <p className="text-2xl font-semibold text-delivered tabular-nums">
                {result.imported}
              </p>
              <p className="text-xs text-secondary mt-1">Imported</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-scheduled tabular-nums">
                {result.updated}
              </p>
              <p className="text-xs text-secondary mt-1">Updated</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-secondary tabular-nums">
                {result.skipped}
              </p>
              <p className="text-xs text-secondary mt-1">Skipped</p>
            </div>
          </div>

          <button
            onClick={() => router.push("/contacts")}
            className="px-6 py-2.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2"
          >
            View contacts
          </button>
        </div>
      )}
    </div>
  );
}
