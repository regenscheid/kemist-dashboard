/**
 * Shared frame for every section of the per-domain detail view.
 *
 * Provides:
 *   - h2 heading with optional hint sub-line + right-side slot
 *   - anchor id for in-page nav (`#negotiation`, `#kx`, etc.)
 *   - "Copy JSON" button that serializes the section's slice
 */

import { useState } from "react";

type Props = {
  /** Anchor id used by the in-page nav. Defaults to slugified title. */
  id?: string;
  /** Short noun or phrase — "Negotiation", "Validation". */
  title: string;
  /** Per-section helper text rendered below the heading. */
  description?: string;
  /** Raw JSON slice exposed by the Copy button. */
  json?: unknown;
  /** Optional right-side slot — toggle, link, etc. */
  right?: React.ReactNode;
  children: React.ReactNode;
};

export function DetailSection({
  id,
  title,
  description,
  json,
  right,
  children,
}: Props) {
  const slug = id ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <section
      id={slug}
      aria-labelledby={`section-${slug}`}
      // scroll-mt accounts for the sticky header so anchor jumps don't
      // hide the section title underneath it
      className="scroll-mt-24 rounded-md border border-line bg-surface p-5"
    >
      <header className="flex items-baseline gap-4">
        <h2
          id={`section-${slug}`}
          className="text-[18px] font-semibold tracking-[-0.005em]"
        >
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {right}
          {json !== undefined && <CopyJsonButton json={json} />}
        </div>
      </header>
      {description && (
        <p className="mt-1 text-[13px] text-ink-2">{description}</p>
      )}
      <div className="mt-4">{children}</div>
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
      className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3 underline-offset-2 hover:text-ink hover:underline"
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
 * Two-column label/value grid for sections like Negotiation or HTTP
 * KV blocks.
 */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[13px]">
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
      <dt className="font-mono text-[11px] uppercase tracking-[0.05em] text-ink-3">
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
