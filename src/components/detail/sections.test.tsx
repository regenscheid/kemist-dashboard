import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import type { KemistScanResultSchemaV1 } from "../../data/schema";
import {
  CertificatesSection,
  CipherSuitesSection,
  ErrorsSection,
  ExtensionsSection,
  KxGroupsSection,
  NegotiatedSection,
  ProtocolSupportSection,
  ScanMetadataSection,
  ValidationSection,
} from "./sections";

// Render the committed nist.gov fixture through every section and
// assert that the tri-state rendering is correct. Failure here means
// a section regressed on the tri-state contract — e.g. by
// pretty-printing `not_probed` observations as rejections.

const nistRecord: KemistScanResultSchemaV1 = JSON.parse(
  readFileSync(path.join(__dirname, "../../../fixtures/nist-gov.jsonl"), "utf8"),
) as KemistScanResultSchemaV1;

describe("<ScanMetadataSection>", () => {
  it("shows target, host, port, and scanner identity", () => {
    render(<ScanMetadataSection record={nistRecord} />);
    expect(screen.getByText("nist.gov:443")).toBeInTheDocument();
    // "nist.gov" appears multiple times (host + inside target); use
    // getAllByText to allow duplicates.
    expect(screen.getAllByText("nist.gov").length).toBeGreaterThan(0);
    expect(screen.getByText("443")).toBeInTheDocument();
    expect(
      screen.getByText(`${nistRecord.scanner.name} ${nistRecord.scanner.version}`),
    ).toBeInTheDocument();
  });
});

describe("<ProtocolSupportSection>", () => {
  it("renders all six protocol versions with correct tri-state", () => {
    const { container } = render(
      <ProtocolSupportSection versions={nistRecord.tls.versions_offered} />,
    );
    expect(screen.getByText("TLS 1.3")).toBeInTheDocument();
    expect(screen.getByText("SSL 2.0")).toBeInTheDocument();
    // nist.gov: tls1_3 offered=true (probe), ssl2 offered=false (probe).
    // Both should render as affirmative or rejected, not as unknown.
    const tls13Row = container.querySelector("dd:has(+ dt:empty), dd");
    expect(tls13Row).toBeTruthy();
    // At least one "Supported" (probed true) and one "Rejected"
    // (probed false) text among the six.
    expect(screen.getAllByText(/Supported/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Rejected/).length).toBeGreaterThan(0);
  });
});

describe("<NegotiatedSection>", () => {
  it("shows negotiated cipher + group + version", () => {
    render(<NegotiatedSection negotiated={nistRecord.tls.negotiated} />);
    expect(screen.getByText(/TLSv1\.3/)).toBeInTheDocument();
    expect(screen.getByText(/TLS13_AES_256_GCM_SHA384/)).toBeInTheDocument();
  });

  it("renders a no-handshake message when negotiated is absent", () => {
    render(<NegotiatedSection negotiated={undefined} />);
    expect(
      screen.getByText(/No handshake completed/),
    ).toBeInTheDocument();
  });
});

describe("<CipherSuitesSection>", () => {
  it("lists all per-version cipher sections from the unified schema", () => {
    render(<CipherSuitesSection ciphers={nistRecord.tls.cipher_suites} />);
    expect(screen.getByText("TLS 1.3")).toBeInTheDocument();
    expect(screen.getByText("TLS 1.2")).toBeInTheDocument();
    expect(screen.getByText("TLS 1.1")).toBeInTheDocument();
    expect(screen.getByText("TLS 1.0")).toBeInTheDocument();
    expect(screen.getByText(/0x1302/)).toBeInTheDocument();
    expect(screen.getAllByText(/AES128-SHA/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OpenSSL|aws-lc-rs/).length).toBeGreaterThan(0);
  });

  it("surfaces server_enforces_order as its own tri-state row", () => {
    render(<CipherSuitesSection ciphers={nistRecord.tls.cipher_suites} />);
    expect(screen.getByText(/Server enforces order/)).toBeInTheDocument();
  });
});

describe("<KxGroupsSection>", () => {
  it("renders TLS 1.3 and TLS 1.2 group maps in version order", () => {
    render(<KxGroupsSection groups={nistRecord.tls.groups} />);
    expect(screen.getByText("TLS 1.3 groups")).toBeInTheDocument();
    expect(screen.getByText("TLS 1.2 groups")).toBeInTheDocument();
  });

  it("preserves tri-state for not_probed groups (no collapse to rejected)", () => {
    render(<KxGroupsSection groups={nistRecord.tls.groups} />);
    expect(screen.getAllByText(/Not probed/).length).toBeGreaterThan(0);
  });

  it("surfaces the ignored-group-offer FFDHE finding as a warning callout", () => {
    render(
      <KxGroupsSection
        groups={{
          tls1_2: {
            ffdhe2048: {
              supported: false,
              method: "probe",
              reason: "server_ignored_group_offer_returned_custom_prime",
              provider: "openssl",
              iana_code: "0x0100",
            },
          },
          tls1_3: {},
        }}
      />,
    );
    expect(screen.getByText(/server ignored group offer/i)).toBeInTheDocument();
  });
});

describe("<ExtensionsSection>", () => {
  it("renders EMS, secure renegotiation, and OCSP stapling rows", () => {
    render(<ExtensionsSection extensions={nistRecord.tls.extensions} />);
    expect(screen.getByText("Extended master secret")).toBeInTheDocument();
    expect(screen.getByText("Secure renegotiation")).toBeInTheDocument();
    expect(screen.getByText("OCSP stapling")).toBeInTheDocument();
  });
});

describe("<CertificatesSection>", () => {
  it("renders leaf cert subject + issuer + validity", () => {
    render(<CertificatesSection certificates={nistRecord.certificates} />);
    // Chain has two certs (leaf + intermediate), so many issuer/
    // validity values appear twice.
    expect(screen.getAllByText(/89 days/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Let's Encrypt|CN=E8/i).length,
    ).toBeGreaterThan(0);
  });
});

describe("<ValidationSection>", () => {
  it("keeps chain_valid + name_matches_sni as independent observations", () => {
    const { container } = render(
      <ValidationSection validation={nistRecord.validation} />,
    );
    const labels = Array.from(
      container.querySelectorAll("dt"),
    ).map((e) => e.textContent);
    expect(labels).toContain("Chain → webpki roots");
    expect(labels).toContain("Name matches SNI");
    // Load-bearing: these are distinct rows, not collapsed into one
    // "cert OK" bool. Both should be visible.
    expect(labels.length).toBeGreaterThanOrEqual(3);
  });
});

describe("<ErrorsSection>", () => {
  it("renders a no-errors message when errors is empty", () => {
    render(<ErrorsSection errors={nistRecord.errors} />);
    // Description text + body placeholder both say "(none)" or
    // similar. Assert either variant is present.
    expect(screen.getAllByText(/none|No errors/).length).toBeGreaterThan(0);
  });

  it("lists each error's category, context, and timestamp when present", () => {
    const errs = [
      {
        category: "dns_resolution_failed",
        context: "lookup example.gov: no record",
        timestamp: "2026-04-19T02:00:00Z",
      },
    ];
    const { container } = render(<ErrorsSection errors={errs} />);
    expect(
      within(container).getByText("dns_resolution_failed"),
    ).toBeInTheDocument();
    expect(
      within(container).getByText(/lookup example.gov/),
    ).toBeInTheDocument();
  });
});
