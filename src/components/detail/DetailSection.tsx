/**
 * Shared frame for every section of the per-domain detail view.
 *
 * Provides:
 *   - heading + optional description
 *   - <details>-like collapse (defaults open)
 *   - a "Copy JSON" button that serializes the underlying observation
 *     slice to the clipboard so anyone quoting a number can include
 *     the raw data
 */

import { useState } from "react";

type Props = {
  /** Short noun or phrase — "Protocol support", "Certificate chain". */
  title: string;
  /** Per-section helper text; rendered below the heading. */
  description?: string;
  /** Raw JSON slice to expose via the Copy button. Unchanged by the
   *  component — caller serializes the shape they want. */
  json?: unknown;
  children: React.ReactNode;
};

export function DetailSection({ title, description, json, children }: Props) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section
      aria-labelledby={`section-${slug}`}
      className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/30"
    >
      <div className="flex items-baseline gap-4">
        <h2
          id={`section-${slug}`}
          className="text-lg font-semibold tracking-tight"
        >
          {title}
        </h2>
        {json !== undefined && <CopyJsonButton json={json} />}
      </div>
      {description && (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {description}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CopyJsonButton({ json }: { json: unknown }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  async function onClick() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      setState("copied");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-auto text-xs text-slate-600 underline-offset-2 hover:underline dark:text-slate-400"
    >
      {state === "idle"
        ? "Copy JSON"
        : state === "copied"
          ? "Copied ✓"
          : "Copy failed"}
    </button>
  );
}

/**
 * Two-column label/value grid used inside many sections. Keeps
 * styling consistent across `Scan metadata`, `Negotiated handshake`,
 * and similar rows-of-pairs.
 */
export function FieldGrid({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      {children}
    </dl>
  );
}

export function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
