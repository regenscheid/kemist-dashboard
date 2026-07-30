import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { KemistScanResultSchemaV2 } from "./schema";
import {
  getClientAuthDistinguishedNameHex,
  getClientAuthOidFilterValuesHex,
  getCompressionBehavior,
  getObservedChains,
  getPrimaryLeaf,
  getRenegotiationRows,
  getSniProbeRows,
} from "./schemaCompat";

const nistRecord: KemistScanResultSchemaV2 = JSON.parse(
  readFileSync(path.join(__dirname, "../../fixtures/nist-gov.jsonl"), "utf8"),
) as KemistScanResultSchemaV2;

function clone(record: KemistScanResultSchemaV2): KemistScanResultSchemaV2 {
  return structuredClone(record);
}

describe("schema compatibility helpers", () => {
  it("prefers observed_chains over legacy leaf/chain fields", () => {
    const record = clone(nistRecord);
    const leaf = record.certificates.leaf ?? record.certificates.chain[0];
    expect(leaf).toBeDefined();
    if (!leaf) return;

    record.certificates.observed_chains = [
      {
        chain_id: "primary",
        role: "primary",
        observed_via: ["characterization_handshake"],
        leaf_fingerprint_sha256: "a".repeat(64),
        chain_fingerprint_sha256: "b".repeat(64),
        chain: [{ ...leaf, subject_dn: "CN=preferred.example" }],
      },
    ];

    expect(getObservedChains(record.certificates)[0]?.chain_id).toBe("primary");
    expect(getPrimaryLeaf(record.certificates)?.subject_dn).toBe(
      "CN=preferred.example",
    );
  });

  it("synthesizes observed chains from legacy certificate fields", () => {
    const record = clone(nistRecord);
    delete record.certificates.observed_chains;

    const chains = getObservedChains(record.certificates);

    expect(chains[0]?.role).toBe("primary");
    expect(chains[0]?.observed_via).toEqual(["legacy.certificates.chain"]);
    expect(chains[0]?.chain[0]?.fingerprint_sha256).toBe(
      getPrimaryLeaf(record.certificates)?.fingerprint_sha256,
    );
  });

  it("prefers v2.1 SNI probe rows", () => {
    const record = clone(nistRecord);
    record.tls.sni_behavior.probes = [
      {
        variant: "bogus_dns",
        sni_sent: "not-this-host.example",
        outcome: "rejected",
        reason: "unrecognized_name_alert",
      },
    ];

    expect(getSniProbeRows(record.tls.sni_behavior)).toEqual([
      {
        variant: "bogus_dns",
        sni_sent: "not-this-host.example",
        outcome: "rejected",
        reason: "unrecognized_name_alert",
      },
    ]);
  });

  it("synthesizes omitted-SNI rows from legacy fields", () => {
    const record = clone(nistRecord);
    delete record.tls.sni_behavior.probes;
    record.tls.sni_behavior.omitted_probe = "different_cert";
    record.tls.sni_behavior.method = "probe";

    expect(getSniProbeRows(record.tls.sni_behavior)[0]).toMatchObject({
      variant: "omitted",
      sni_sent: null,
      outcome: "different_cert",
    });
  });

  it("prefers nested renegotiation observations", () => {
    const record = clone(nistRecord);
    record.tls.renegotiation_behavior.client_initiated = {
      accepted: { value: true, method: "probe" },
    };
    record.tls.renegotiation_behavior.server_initiated = {
      observed: { value: false, method: "probe" },
    };

    expect(getRenegotiationRows(record.tls.renegotiation_behavior)).toEqual([
      {
        label: "Client-initiated renegotiation",
        observation: { value: true, method: "probe" },
        polarity: "negative",
        labels: { whenTrue: "Accepted", whenFalse: "Refused by server" },
      },
      {
        label: "Server-initiated renegotiation",
        observation: { value: false, method: "probe" },
        polarity: "negative",
        labels: { whenTrue: "Observed", whenFalse: "Not observed" },
      },
    ]);
  });

  it("maps legacy renegotiation verdicts to observations", () => {
    const record = clone(nistRecord);
    delete record.tls.renegotiation_behavior.client_initiated;
    delete record.tls.renegotiation_behavior.server_initiated;
    record.tls.renegotiation_behavior.client_initiated_verdict = "rejected";
    record.tls.renegotiation_behavior.method = "probe";
    delete record.tls.renegotiation_behavior.reason;
    record.tls.renegotiation_behavior.server_initiated_observed = {
      value: null,
      method: "not_probed",
    };
    record.tls.renegotiation_behavior.server_initiated_probe_reason =
      "legacy_reason";

    expect(getRenegotiationRows(record.tls.renegotiation_behavior)).toEqual([
      {
        label: "Client-initiated renegotiation",
        observation: { value: false, method: "probe" },
        polarity: "negative",
        labels: { whenTrue: "Accepted", whenFalse: "Refused by server" },
      },
      {
        label: "Server-initiated renegotiation",
        observation: {
          value: null,
          method: "not_probed",
          reason: "legacy_reason",
        },
        polarity: "negative",
        labels: { whenTrue: "Observed", whenFalse: "Not observed" },
      },
    ]);
  });

  it("handles legacy renegotiation records without server-initiated fields", () => {
    const record = clone(nistRecord);
    delete record.tls.renegotiation_behavior.client_initiated;
    delete record.tls.renegotiation_behavior.server_initiated;
    const looseRenegotiation = record.tls.renegotiation_behavior as unknown as {
      server_initiated_observed?: unknown;
      server_initiated_probe_reason?: unknown;
    };
    delete looseRenegotiation.server_initiated_observed;
    delete looseRenegotiation.server_initiated_probe_reason;

    expect(getRenegotiationRows(record.tls.renegotiation_behavior)[1]).toEqual({
      label: "Server-initiated renegotiation",
      observation: {
        value: null,
        method: "not_probed",
        reason: "server_initiated_renegotiation_not_recorded",
      },
      polarity: "negative",
      labels: { whenTrue: "Observed", whenFalse: "Not observed" },
    });
  });

  it("prefers accurately named client-auth hex fields", () => {
    expect(
      getClientAuthDistinguishedNameHex({
        raw_der_hex: "abcd",
        raw_der_b64: "legacy",
      }),
    ).toBe("abcd");
    expect(
      getClientAuthOidFilterValuesHex({
        oid: "1.2.3",
        values_hex: ["abcd"],
        values_b64: ["legacy"],
      }),
    ).toEqual(["abcd"]);
  });

  it("reads v2.1 compression behavior fields", () => {
    const record = clone(nistRecord);
    record.tls.behavioral_probes.compression_selected = "null";
    record.tls.behavioral_probes.crime_vulnerable = {
      value: false,
      method: "probe",
    };
    record.tls.behavioral_probes.record_compression_by_version = [];

    expect(getCompressionBehavior(record.tls.behavioral_probes)).toMatchObject({
      selected: "null",
      vulnerable: { value: false, method: "probe" },
    });
  });

  it("maps legacy compression_offered to a vulnerability observation", () => {
    const record = clone(nistRecord);
    const legacyProbes = record.tls.behavioral_probes as typeof record.tls.behavioral_probes & {
      compression_offered: string[];
    };
    legacyProbes.compression_offered = ["DEFLATE"];

    expect(getCompressionBehavior(record.tls.behavioral_probes)).toMatchObject({
      selected: "DEFLATE",
      vulnerable: { value: true, method: "probe" },
    });
  });
});
