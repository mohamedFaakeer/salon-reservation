"use client";

import { useState } from "react";
import { ApiRequestError, importProducts, type ImportRowError, type ImportSummary } from "../lib/api-client";
import { DrawerShell } from "./drawer-shell";
import { BusyLabel } from "./spinner";

const TEMPLATE_HEADER =
  "name,category,brand,sku,barcode,price_rs,size_volume,weight,color,opening_qty,opening_cost_rs,reorder_point,tracks_expiry,track_serial";

type Step = "template" | "upload" | "errors" | "success";

/**
 * Bulk product setup for a new salon — download the template, fill it in
 * Excel, upload it back. Everything is validated up front (`errors` shows
 * every row's problem at once) and nothing is created until the whole file
 * is clean, matching `ProductImportService`'s all-or-nothing contract.
 */
export function ProductImportDrawer({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>("template");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rowErrors, setRowErrors] = useState<ImportRowError[]>([]);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  function downloadTemplate(): void {
    const blob = new Blob([TEMPLATE_HEADER + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function submit(): Promise<void> {
    if (!file) {
      return;
    }
    setSubmitting(true);
    setGenericError(null);
    setRowErrors([]);
    try {
      const result = await importProducts(file);
      setSummary(result);
      setStep("success");
      onImported();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === "IMPORT_VALIDATION_FAILED") {
        setRowErrors((err.details?.rowErrors as ImportRowError[] | undefined) ?? []);
        setStep("errors");
      } else {
        setGenericError(err instanceof ApiRequestError ? err.message : "Couldn't import this file.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerShell title="Import products" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {step === "template" ? (
          <>
            <p className="text-sm text-slate-600">
              Fill in one row per product variant. Nothing is created until every row checks out.
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-sm font-semibold text-slate-900">products-import-template.csv</p>
              <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-slate-500">{TEMPLATE_HEADER}</p>
              <button
                type="button"
                data-testid="import-download-template"
                onClick={downloadTemplate}
                className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded border border-teal-600 px-3 text-xs font-semibold text-teal-700 hover:bg-teal-50"
              >
                <DownloadIcon />
                Download template
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="min-h-11 self-start rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
            >
              Next: upload file
            </button>
          </>
        ) : null}

        {step === "upload" ? (
          <>
            <p className="text-sm text-slate-600">Upload the filled-in CSV.</p>
            {genericError ? (
              <p role="alert" className="text-xs text-red-600">
                {genericError}
              </p>
            ) : null}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-7 text-center hover:bg-slate-100">
              <UploadIcon />
              <span className="text-sm font-medium text-slate-700">{file ? file.name : "Click to choose a CSV file"}</span>
              <span className="text-xs text-slate-400">.csv up to 5 MB</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                data-testid="import-file-input"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("template")}
                className="min-h-11 flex-1 rounded border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                data-testid="import-submit"
                disabled={!file || submitting}
                onClick={() => void submit()}
                className="min-h-11 flex-1 rounded bg-teal-600 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <BusyLabel busy={submitting} busyText="Validating…">
                  Validate file
                </BusyLabel>
              </button>
            </div>
          </>
        ) : null}

        {step === "errors" ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-800">
              <AlertIcon />
              {rowErrors.length} row{rowErrors.length === 1 ? "" : "s"} need fixing before anything is imported
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <caption className="sr-only">Rows that failed validation</caption>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Row</th>
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wide text-slate-500">Problem</th>
                  </tr>
                </thead>
                <tbody>
                  {rowErrors.map((rowError, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-b-0">
                      <td className="tabular px-3 py-2 font-mono text-slate-500">{rowError.row}</td>
                      <td className="px-3 py-2 text-red-700">{rowError.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="min-h-11 self-start rounded border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Upload a fixed file
            </button>
          </>
        ) : null}

        {step === "success" && summary ? (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
              <CheckIcon />
              {summary.productsCreated} product{summary.productsCreated === 1 ? "" : "s"}, {summary.variantsCreated} variant
              {summary.variantsCreated === 1 ? "" : "s"} created
            </div>
            <div className="flex flex-col gap-1.5">
              {summary.products.map((p, i) => (
                <div key={i} className="flex items-baseline justify-between border-b border-slate-100 pb-1.5 text-sm">
                  <span className="text-slate-900">{p.name}</span>
                  <span className="tabular font-mono text-xs text-slate-500">
                    {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 self-start rounded bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700"
            >
              Done
            </button>
          </>
        ) : null}
      </div>
    </DrawerShell>
  );
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2v8m0 0 3-3m-3 3-3-3M3 12v1.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-slate-400" aria-hidden="true">
      <path
        d="M7 18a4 4 0 0 1-1-7.87A5 5 0 0 1 15.9 8H16a4 4 0 0 1 1 7.87M9 15l3-3 3 3M12 12v8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5 15 14H1L8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 8.5 6 12l7.5-8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
