import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadScansIndex, loadScanManifest } from "../db/loader";

export const Route = createFileRoute("/about")({
  component: AboutRoute,
});

type LiveProvenance = {
  scanDate: string | null;
  scannerVersion: string | null;
  schemaVersion: string | null;
};

function AboutRoute() {
  const [prov, setProv] = useState<LiveProvenance>({
    scanDate: null,
    scannerVersion: null,
    schemaVersion: null,
  });

  // Pull live scanner + schema versions from the currently published
  // scan so the About page never has to be hand-updated when kemist
  // ships a new release. If the fetch fails we just leave the
  // badges blank.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scans = await loadScansIndex();
        const latest = scans[0];
        if (!latest) return;
        const scan = await loadScanManifest(latest.date);
        if (cancelled) return;
        const batch = scan.manifest.batches[0];
        setProv({
          scanDate: latest.date,
          scannerVersion: null, // written per-record, not in manifest; surfaced on detail pages
          schemaVersion: batch?.schema_version ?? null,
        });
      } catch {
        // ignore — About still renders without live badges
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <article
      aria-labelledby="about-heading"
      className="mx-auto max-w-3xl space-y-10 leading-relaxed"
    >
      <header>
        <h1
          id="about-heading"
          className="text-3xl font-semibold tracking-tight"
        >
          About kemist-dashboard
        </h1>
        <p className="mt-3 text-slate-600 dark:text-slate-400">
          A static view of observations produced by the
          {" "}
          <a
            className="underline decoration-slate-400 underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100"
            href="https://github.com/regenscheid/kemist-scanner"
          >
            kemist
          </a>
          {" "}
          TLS + PQC scanner.
        </p>
      </header>

      <section aria-labelledby="about-observations">
        <h2
          id="about-observations"
          className="text-xl font-semibold tracking-tight"
        >
          What this site is (and isn't)
        </h2>
        <p className="mt-2">
          This dashboard presents observations. It does not grade, rank,
          or judge the servers it observes. Words like
          {" "}
          <em>weak</em>, <em>strong</em>, <em>insecure</em>,
          {" "}
          <em>compliant</em>, and <em>recommended</em> do not appear in
          our UI.
        </p>
        <p className="mt-2">
          This mirrors the kemist scanner's own stance. Its README says:
        </p>
        <blockquote className="mt-3 border-l-4 border-slate-400 bg-slate-50 px-4 py-2 italic text-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          kemist is a TLS + PQC observation scanner that records what
          servers support and emits structured JSON for downstream rule
          engines. kemist is a pure sensor — it faithfully records TLS
          configuration, PQC key agreement support, and certificate
          details without producing compliance verdicts, grades, or
          pass/fail judgments. Rule evaluation belongs in separate
          downstream projects that consume kemist's JSON output.
        </blockquote>
        <p className="mt-2">
          If you're looking for verdicts or scores, you're looking at
          the wrong project. This site tells you what the scanner saw;
          interpreting that through a specific policy is up to you.
        </p>
      </section>

      <section aria-labelledby="about-tri-state">
        <h2
          id="about-tri-state"
          className="text-xl font-semibold tracking-tight"
        >
          The tri-state contract
        </h2>
        <p className="mt-2">
          Every probe-derived observation carries three pieces of
          information: a value (<code>true</code>, <code>false</code>,
          or <code>null</code>), a method that says how the value was
          obtained, and an optional reason. The dashboard never
          collapses <code>null</code> (<em>unknown</em>) into
          {" "}
          <code>false</code> (<em>rejected</em>).
        </p>
        <p className="mt-2">
          In charts, unknown observations appear as their own explicit
          segment. In cards, every rate shows three counts —{" "}
          <em>supported</em>, <em>rejected</em>, and <em>unknown</em> —
          never a bare percentage. See
          {" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/regenscheid/kemist-dashboard/blob/main/docs/AGGREGATION_RULES.md"
          >
            AGGREGATION_RULES.md
          </a>
          {" "}
          for the exact bucketing rules.
        </p>
      </section>

      <section aria-labelledby="about-methodology">
        <h2
          id="about-methodology"
          className="text-xl font-semibold tracking-tight"
        >
          How the data gets here
        </h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          <li>
            Weekly, a scheduled EventBridge rule kicks off a Step
            Functions state machine in
            {" "}
            <a
              className="underline underline-offset-2"
              href="https://github.com/regenscheid/kemist-orchestrator"
            >
              kemist-orchestrator
            </a>
            .
          </li>
          <li>
            The state machine fans out to Fargate Spot tasks. Each task
            runs kemist against a batch of targets and writes the
            NDJSON output to S3 as
            {" "}
            <code>raw/dt=YYYY-MM-DD/batch-NNN.jsonl.gz</code>.
          </li>
          <li>
            A GitHub Actions workflow in this repo pulls the latest
            scan from S3, runs consistency checks, transforms the
            records into the shape used by this UI, and publishes to
            GitHub Pages.
          </li>
        </ol>
        <p className="mt-2">
          Consistency checks that abort the deploy: schema version
          mismatch, manifest ↔ batch file drift, duplicate targets, and
          divergent{" "}
          <code>capabilities.provider_kx_groups</code> across batches.
          Warnings (scanner patch drift, differing enabled features)
          surface in the provenance strip rather than aborting.
        </p>
      </section>

      <section aria-labelledby="about-optout">
        <h2
          id="about-optout"
          className="text-xl font-semibold tracking-tight"
        >
          Opt-out
        </h2>
        <p className="mt-2">
          The initial scan cohort is the GSA{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/GSA/federal-website-index"
          >
            federal-website-index
          </a>
          . If you own a domain on this list (or on future cohorts we
          add) and want it excluded from scans, file an issue in{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/regenscheid/kemist-orchestrator/issues/new"
          >
            kemist-orchestrator
          </a>
          {" "}
          or email the operator.
        </p>
        <p className="mt-2">
          The opt-out list lives at{" "}
          <code>s3://…/targets/opt-out.txt</code> in the orchestrator's
          data bucket. Once your domain is added it'll be excluded from
          the refreshed target list on the next weekly run — no
          retroactive deletion of historical data, but no new scans.
          See{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/regenscheid/kemist-dashboard/blob/main/docs/OPT_OUT.md"
          >
            OPT_OUT.md
          </a>
          {" "}
          for the full procedure.
        </p>
      </section>

      <section aria-labelledby="about-reproducibility">
        <h2
          id="about-reproducibility"
          className="text-xl font-semibold tracking-tight"
        >
          Reproducibility
        </h2>
        <p className="mt-2">
          Every record this dashboard shows carries the scanner
          version and schema version it was produced against. The
          detail view has a Download raw JSON button so any claim you
          screenshot or quote can be verified against the original
          record.
        </p>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          {prov.scanDate && (
            <>
              <dt className="text-slate-500">Latest scan</dt>
              <dd>{prov.scanDate}</dd>
            </>
          )}
          {prov.schemaVersion && (
            <>
              <dt className="text-slate-500">Schema version</dt>
              <dd>
                <a
                  className="underline underline-offset-2"
                  href="https://github.com/regenscheid/kemist-scanner/blob/main/schemas/output-v1.json"
                >
                  v{prov.schemaVersion}
                </a>
              </dd>
            </>
          )}
        </dl>
      </section>

      <section aria-labelledby="about-projects">
        <h2
          id="about-projects"
          className="text-xl font-semibold tracking-tight"
        >
          The three repos
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>
            <a
              className="underline underline-offset-2"
              href="https://github.com/regenscheid/kemist-scanner"
            >
              kemist-scanner
            </a>{" "}
            — the Rust TLS + PQC scanner. Pure sensor, schema-v1 NDJSON
            output.
          </li>
          <li>
            <a
              className="underline underline-offset-2"
              href="https://github.com/regenscheid/kemist-orchestrator"
            >
              kemist-orchestrator
            </a>{" "}
            — AWS CDK + Step Functions + Fargate pipeline that runs
            the scanner weekly and lands results in S3.
          </li>
          <li>
            <a
              className="underline underline-offset-2"
              href="https://github.com/regenscheid/kemist-dashboard"
            >
              kemist-dashboard
            </a>{" "}
            — this site.
          </li>
        </ul>
      </section>
    </article>
  );
}
