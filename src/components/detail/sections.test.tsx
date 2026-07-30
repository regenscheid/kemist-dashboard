import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  CipherSuiteEntry,
  KemistScanResultSchemaV2,
} from "../../data/schema";
import {
  BehavioralProbesSection,
  CertificatesSection,
  CipherSuitesSection,
  ErrorsSection,
  ExtensionsSection,
  KxGroupsSection,
  NegotiatedSection,
  ProtocolSupportSection,
  RenegotiationBehaviorSection,
  ScanMetadataSection,
  SessionResumptionSection,
  SniBehaviorSection,
  ValidationSection,
} from "./sections";
import { KxCombinedTable } from "./KxCombinedTable";

// Render the committed nist.gov fixture through every section and
// assert that the tri-state rendering is correct. Failure here means
// a section regressed on the tri-state contract — e.g. by
// pretty-printing `not_probed` observations as rejections.

const nistRecord: KemistScanResultSchemaV2 = JSON.parse(
  readFileSync(path.join(__dirname, "../../../fixtures/nist-gov.jsonl"), "utf8"),
) as KemistScanResultSchemaV2;

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

describe("<SniBehaviorSection>", () => {
  it("renders v2.1 SNI probe rows", () => {
    const record = structuredClone(nistRecord);
    record.tls.sni_behavior.probes = [
      {
        variant: "bogus_dns",
        sni_sent: "wrong.example",
        outcome: "rejected",
        reason: "unrecognized_name_alert",
      },
    ];

    render(<SniBehaviorSection sniBehavior={record.tls.sni_behavior} />);

    expect(screen.getByText("bogus_dns")).toBeInTheDocument();
    expect(screen.getByText("wrong.example")).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });
});

describe("<RenegotiationBehaviorSection>", () => {
  it("renders nested v2.1 renegotiation observations", () => {
    const record = structuredClone(nistRecord);
    record.tls.renegotiation_behavior.client_initiated = {
      accepted: { value: false, method: "probe" },
    };
    record.tls.renegotiation_behavior.server_initiated = {
      observed: { value: null, method: "not_probed", reason: "not_http" },
    };

    render(
      <RenegotiationBehaviorSection
        renegotiation={record.tls.renegotiation_behavior}
      />,
    );

    expect(
      screen.getByText("Client-initiated renegotiation"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Server-initiated renegotiation"),
    ).toBeInTheDocument();
    expect(screen.getByText(/not_http/)).toBeInTheDocument();
  });

  it("renders a refused client-initiated renegotiation as the safe outcome", () => {
    // Negative polarity: `accepted: false` is what a correctly configured
    // server does. The generic tri-state mapping rendered this as a red
    // "Rejected", which read as a finding on essentially every host.
    const record = structuredClone(nistRecord);
    record.tls.renegotiation_behavior.client_initiated = {
      accepted: {
        value: false,
        method: "probe",
        reason: "server_sent_no_renegotiation_alert",
      },
    };

    render(
      <RenegotiationBehaviorSection
        renegotiation={record.tls.renegotiation_behavior}
      />,
    );

    const status = screen.getByText("Refused by server");
    expect(status).toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    expect(status.parentElement?.className).toContain("text-green");
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

  it("hides unsupported cipher suites across all versions with a reveal link", () => {
    const record = structuredClone(nistRecord);
    const baseCipher = record.tls.cipher_suites.tls1_3[0] as CipherSuiteEntry;
    const supported: CipherSuiteEntry = {
      ...baseCipher,
      name: "TLS13_SUPPORTED_TEST_SUITE",
      iana_code: "0x13F0",
      supported: true,
      method: "probe" as const,
    };
    const unsupported: CipherSuiteEntry = {
      ...baseCipher,
      name: "TLS13_UNSUPPORTED_TEST_SUITE",
      iana_code: "0x13F1",
      supported: false,
      method: "probe" as const,
    };
    record.tls.cipher_suites = {
      ...record.tls.cipher_suites,
      tls1_3: [supported, unsupported],
      tls1_2: [],
      tls1_1: [],
      tls1_0: [],
    };

    render(
      <CipherSuitesSection
        ciphers={record.tls.cipher_suites}
        hideUnsupported
      />,
    );

    expect(screen.getByText("TLS13_SUPPORTED_TEST_SUITE")).toBeInTheDocument();
    expect(screen.queryByText("TLS13_UNSUPPORTED_TEST_SUITE")).toBeNull();
    fireEvent.click(screen.getByText("Show 1 row hidden by filter"));
    expect(screen.getByText("TLS13_UNSUPPORTED_TEST_SUITE")).toBeInTheDocument();
  });
});

describe("<KxCombinedTable>", () => {
  it("hides unsupported KX groups with a per-version reveal link", () => {
    render(
      <KxCombinedTable
        groups={{
          tls1_3: {
            x25519: { supported: true, method: "probe" },
            secp256r1: { supported: false, method: "probe" },
          },
          tls1_2: {},
        }}
        hideUnsupported
      />,
    );

    expect(screen.getByText("x25519")).toBeInTheDocument();
    expect(screen.queryByText("secp256r1")).toBeNull();
    fireEvent.click(screen.getByText("Show 1 row hidden by filter"));
    expect(screen.getByText("secp256r1")).toBeInTheDocument();
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

  it("surfaces the FFDHE static-dhparam finding with returned-prime context", () => {
    // v2: cross-codepoint coherence pass downgrades every FFDHE TLS 1.2
    // row when the static-dhparam fallback is detected. Old string
    // server_ignored_group_offer_returned_custom_prime is replaced.
    render(
      <KxGroupsSection
        groups={{
          tls1_2: {
            ffdhe2048: {
              supported: false,
              method: "probe",
              reason: "server_does_not_honor_supported_groups",
              provider: "openssl",
              iana_code: "0x0100",
              returned_group: "ffdhe2048",
              returned_prime_bits: 2048,
            },
          },
          tls1_3: {},
        }}
      />,
    );
    expect(
      screen.getByText(/server does not honor supported_groups/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/ffdhe2048 \(2048-bit\)/)).toBeInTheDocument();
  });
});

describe("<ExtensionsSection>", () => {
  it("renders EMS, secure renegotiation, and OCSP stapling rows", () => {
    render(<ExtensionsSection extensions={nistRecord.tls.extensions} />);
    expect(screen.getByText("Extended master secret")).toBeInTheDocument();
    expect(screen.getByText("Secure renegotiation")).toBeInTheDocument();
    expect(screen.getByText("OCSP stapling")).toBeInTheDocument();
  });

  it("does not render the v2-relocated behavioral-probe fields", () => {
    // Schema v2 moved Heartbleed / compression / GREASE / HRR / reuse /
    // Bleichenbacher into tls.behavioral_probes. They must not appear in
    // the extensions section anymore.
    render(<ExtensionsSection extensions={nistRecord.tls.extensions} />);
    expect(screen.queryByText(/Heartbleed/i)).toBeNull();
    expect(screen.queryByText(/HelloRetryRequest/)).toBeNull();
    expect(screen.queryByText(/GREASE echoed/)).toBeNull();
    expect(screen.queryByText(/ephemeral reuse/i)).toBeNull();
  });

  it("renders the generic observed server extension inventory", () => {
    const record = structuredClone(nistRecord);
    record.tls.extensions.observed_server_extensions = [
      {
        protocol_phase: "tls1_3_encrypted_extensions",
        extension_id: "0xFE0D",
        extension_name: "encrypted_client_hello",
      },
    ];

    render(<ExtensionsSection extensions={record.tls.extensions} />);

    expect(screen.getByText("Observed server extensions")).toBeInTheDocument();
    expect(screen.getByText("tls1_3_encrypted_extensions")).toBeInTheDocument();
    expect(screen.getByText("0xFE0D")).toBeInTheDocument();
    expect(screen.getByText("encrypted_client_hello")).toBeInTheDocument();
  });
});

describe("<BehavioralProbesSection>", () => {
  it("renders all six behavioral-probe field labels", () => {
    render(<BehavioralProbesSection probes={nistRecord.tls.behavioral_probes} />);
    expect(screen.getByText(/Heartbleed echo/)).toBeInTheDocument();
    expect(screen.getByText(/Record compression/)).toBeInTheDocument();
    expect(screen.getByText(/GREASE echoed/)).toBeInTheDocument();
    expect(screen.getByText(/HelloRetryRequest/)).toBeInTheDocument();
    expect(screen.getByText(/^DHE ephemeral reuse$/)).toBeInTheDocument();
    expect(screen.getByText(/^ECDHE ephemeral reuse$/)).toBeInTheDocument();
  });

  it("uses field-specific verdict copy (not the generic Supported/Rejected vocabulary) for Heartbleed", () => {
    // Polarity per field: heartbeat=true is Heartbleed-vulnerable, not
    // 'Supported'. Render synthetic vulnerable + clean records and
    // assert the verdict copy distinguishes them.
    const probes = nistRecord.tls.behavioral_probes;
    const cleanProbes = {
      ...probes,
      heartbeat_echoes_oversized_payload: {
        value: false,
        method: "probe" as const,
      },
    };
    const vulnProbes = {
      ...probes,
      heartbeat_echoes_oversized_payload: {
        value: true,
        method: "probe" as const,
      },
    };
    const { rerender } = render(
      <BehavioralProbesSection probes={cleanProbes} />,
    );
    expect(screen.getByText(/Bounds-checked/i)).toBeInTheDocument();
    rerender(<BehavioralProbesSection probes={vulnProbes} />);
    expect(screen.getByText(/Vulnerable.*CVE-2014-0160/i)).toBeInTheDocument();
  });
});

describe("<SessionResumptionSection>", () => {
  it("shows issuance and acceptance rows side by side for tickets and session IDs", () => {
    render(
      <SessionResumptionSection resumption={nistRecord.tls.session_resumption} />,
    );
    // Two pairs (ticket, session-ID); each pair renders Issued +
    // Resumption-accepted as distinct rows.
    expect(
      screen.getByText(/TLS 1\.2 — tickets/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/TLS 1\.2 — session IDs/i),
    ).toBeInTheDocument();
    // Issued + Resumption accepted appear under each pair header.
    expect(screen.getAllByText(/^Issued$/).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText(/^Resumption accepted$/).length,
    ).toBeGreaterThanOrEqual(2);
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
