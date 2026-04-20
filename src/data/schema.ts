/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source: schemas/output-v1.json (vendored from kemist-scanner).
 * Regenerate with: pnpm schema:generate
 */

export type Method = "probe" | "not_probed" | "not_applicable" | "error" | "connection_state";
export type CipherSuiteEntry = {
  [k: string]: unknown;
} & {
  name: string;
  iana_code: string;
  supported: boolean | null;
  method: Method;
  reason?: string;
  openssl_name?: string;
  provider?: "aws_lc_rs" | "openssl";
};
export type ObservationBool = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};

/**
 * One record per scanned target. See docs/OUTPUT_SCHEMA.md for field-by-field semantics. Tri-state: {value: false, method: probe} is a real negative, {value: null, method: not_probed|not_applicable|error} is an absence of signal — downstream rule engines MUST distinguish these.
 */
export interface KemistScanResultSchemaV1 {
  schema_version: "1.0.0";
  scanner: {
    name: string;
    version: string;
  };
  capabilities: {
    enabled_features: string[];
    rustls_version: string;
    aws_lc_rs_version: string;
    native_tls_version: string;
    provider_cipher_suites: string[];
    provider_kx_groups: string[];
    config_paths: string[];
    probe_limitations: string[];
  };
  scan: {
    target: string;
    host: string;
    port: number;
    sni_sent: string;
    resolved_ip?: string;
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
  tls: {
    versions_offered: {
      ssl2: VersionOffered;
      ssl3: VersionOffered;
      tls1_0: VersionOffered;
      tls1_1: VersionOffered;
      tls1_2: VersionOffered;
      tls1_3: VersionOffered;
    };
    negotiated?: {
      version: string;
      cipher_suite?: string;
      group?: string;
      signature_scheme?: string;
      alpn?: string;
    };
    cipher_suites: {
      tls1_0: CipherSuiteEntry[];
      tls1_1: CipherSuiteEntry[];
      tls1_2: CipherSuiteEntry[];
      tls1_3: CipherSuiteEntry[];
      server_enforces_order: ObservationBool;
    };
    groups: {
      tls1_2: {
        [k: string]: GroupObservation;
      };
      tls1_3: {
        [k: string]: GroupObservation;
      };
    };
    extensions: {
      ems: ObservationBool;
      secure_renegotiation: ObservationBool;
      ocsp_stapling: {
        stapled: boolean | null;
        method: Method;
        reason?: string;
        response_length: number;
      };
      sct: {
        delivery_paths: string[];
        count: number;
      };
      alpn_offered: string[];
      encrypt_then_mac: ObservationBool;
      heartbeat_present: ObservationBool;
      heartbeat_echoes_oversized_payload: ObservationBool;
      compression_offered: string[];
    };
    downgrade_signaling: {
      fallback_scsv_accepted: ObservationBool;
      fallback_scsv_enforced: ObservationBool;
    };
    sni_behavior: {
      omitted_probe?: "same_cert" | "different_cert" | "rejected" | "error" | null;
      method: Method;
      reason?: string;
    };
    dh_parameters: DhParametersObservation[];
    server_key_exchange_signatures: SkeSigObservation[];
    renegotiation_behavior: {
      client_initiated_verdict?: "accepted" | "rejected" | "not_attempted" | "error" | null;
      method: Method;
      reason?: string;
    };
    client_auth_request?: {
      requested: boolean;
      certificate_types?: number[];
      signature_algorithms?: string[];
      ca_distinguished_names?: {
        raw_der_b64: string;
        common_name?: string;
        organization?: string;
      }[];
      oid_filters?: {
        oid: string;
        values_b64: string[];
      }[];
      alert_on_empty_cert?: string | null;
      method: Method;
      reason?: string;
    } | null;
  };
  certificates: {
    leaf?: CertificateFacts;
    chain: CertificateFacts[];
    chain_length: number;
  };
  validation: {
    chain_valid_to_webpki_roots: ObservationBool;
    name_matches_sni: ObservationBool;
    validation_error?: string | null;
  };
  http?: {
    enabled: boolean;
    hsts?: {};
    preload_list_status?: string;
    security_txt?: {};
  };
  raw_handshakes?: {} | null;
  errors: {
    category: string;
    context: string;
    timestamp: string;
  }[];
}
export interface VersionOffered {
  offered: boolean | null;
  method: Method;
  reason?: string;
}
export interface GroupObservation {
  supported: boolean | null;
  method: Method;
  reason?: string;
  iana_code?: string;
  provider?: "aws_lc_rs" | "openssl";
}
export interface DhParametersObservation {
  cipher_suite: string;
  prime_bits: number;
  classification: "ffdhe2048" | "ffdhe3072" | "ffdhe4096" | "ffdhe6144" | "ffdhe8192" | "custom";
  generator: number;
  prime_sha256: string;
  prime_raw_hex?: string;
  method: Method;
  reason?: string;
}
export interface SkeSigObservation {
  cipher_suite: string;
  signature_algorithm: string;
  method: Method;
  reason?: string;
}
export interface CertificateFacts {
  subject_cn?: string;
  subject_dn: string;
  san: string[];
  issuer_cn?: string;
  issuer_dn: string;
  serial: string;
  not_before: string;
  not_after: string;
  validity_days: number;
  signature_algorithm_oid: string;
  signature_algorithm_name: string;
  is_pqc_signature: boolean;
  public_key: {
    algorithm: string;
    size_bits: number;
    curve?: string;
  };
  embedded_scts: number;
  fingerprint_sha256: string;
  fingerprint_sha1: string;
}
