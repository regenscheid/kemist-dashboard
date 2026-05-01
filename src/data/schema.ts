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
  /**
   * IANA cipher-suite codepoint. TLS 1.0+ uses 2-byte codes (`0xNNNN`); SSLv2 cipher_specs are 3-byte (`0xNNNNNN`).
   */
  iana_code: string;
  supported: boolean | null;
  method: Method;
  reason?: string;
  openssl_name?: string;
  provider?: "aws_lc_rs" | "openssl" | "raw_socket";
  /**
   * Kx + privacy family per src/model/cipher_classification.rs. Values are stable within schema v2.x; new values may be added.
   */
  classification:
    | "rsa_kex"
    | "dhe_aead"
    | "dhe_cbc"
    | "ecdhe_aead"
    | "ecdhe_cbc"
    | "anon"
    | "export"
    | "static_dh"
    | "static_ecdh"
    | "psk"
    | "dhe_psk"
    | "ecdhe_psk"
    | "rsa_psk"
    | "null_cipher"
    | "other";
};
export type ObservationBool = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};
/**
 * Heartbleed (CVE-2014-0160) probe. `true` = server echoed our oversized-payload heartbeat back, leaking adjacent memory bytes. `false` = server correctly bounds-checked. Distinct from `extensions.heartbeat_present`, which records whether the *extension* itself is advertised.
 */
export type ObservationBool1 = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};
/**
 * RFC 8701 GREASE echo-detection. `true` = server echoed an unknown extension (protocol violation; non-conformant ClientHello parser). `false` = server correctly ignored the GREASE extension we injected.
 */
export type ObservationBool2 = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};
/**
 * RFC 8446 §4.1.3 HelloRetryRequest observation — a ServerHello *variant* (random == sentinel), not an extension. `true` = the dedicated TLS 1.3 ClientHello probe (empty `key_share`) saw a ServerHello whose random matched the HRR sentinel — RFC 8446 conformant. `false` = server responded with a regular ServerHello. `not_applicable` when TLS 1.3 isn't supported on the host.
 */
export type ObservationBool3 = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};
/**
 * Functional RFC 5077 ticket resumption test. The probe captures the session from a first TLS 1.2 handshake and presents it via SSL_set_session on a fresh second handshake; `true` = server accepted the ticket and resumed (SSL_session_reused). Distinct from `session_ticket_issued` (issuance only).
 */
export type ObservationBool4 = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};
/**
 * Functional RFC 5246 §F.1.4 session-ID resumption test. Same shape as `session_ticket_resumption_accepted` but with SSL_OP_NO_TICKET set on both handshakes so the server falls back to session-ID caching. `true` = server accepted the previously-issued session ID and resumed; `false` = server issued an ID but didn't accept it back (the classic 'IDs assigned but not accepted' pattern).
 */
export type ObservationBool5 = {
  [k: string]: unknown;
} & {
  value: boolean | null;
  method: Method;
  reason?: string;
};
export type ChannelBindingValue = {
  [k: string]: unknown;
} & {
  /**
   * Lower-case hex encoding of the channel-binding bytes.
   */
  value?: string;
  method: Method;
  reason?: string;
};

/**
 * One record per scanned target. See docs/OUTPUT_SCHEMA.md for field-by-field semantics. Tri-state: {value: false, method: probe} is a real negative, {value: null, method: not_probed|not_applicable|error} is an absence of signal — downstream rule engines MUST distinguish these.
 */
export interface KemistScanResultSchemaV2 {
  schema_version: "2.0.0";
  scanner: {
    name: string;
    version: string;
  };
  capabilities: {
    enabled_features: string[];
    rustls_version: string;
    aws_lc_rs_version: string;
    openssl_version: string;
    probed_cipher_suites: string[];
    probed_kx_groups: string[];
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
      /**
       * SSLv2 SERVER-HELLO cipher_specs echoed back by the server. Empty on modern servers (expected).
       */
      ssl2?: CipherSuiteEntry[];
      ssl3: CipherSuiteEntry[];
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
    /**
     * True TLS extensions per RFC 5246 §7.4.1.4 / RFC 8446 §4.2 — fields that ride in the `extensions` block of ClientHello / ServerHello / EncryptedExtensions. Schema v2.0 split non-extension handshake observations (vulnerability probes, ClientHello-body fields, ServerHello variants) out of this block into `behavioral_probes`.
     */
    extensions: {
      ems: ObservationBool;
      secure_renegotiation: ObservationBool;
      ocsp_stapling: {
        stapled: boolean | null;
        method: Method;
        reason?: string;
        response_length: number;
        content?: OcspResponseContent;
        /**
         * TLS layer the staple arrived over — CertificateStatus (tls1_2) or status_request in EncryptedExtensions (tls1_3).
         */
        delivery_path?: "tls1_2" | "tls1_3";
        /**
         * Raw DER bytes of the OCSP response, lower-case hex. Gated by `--include-ocsp-raw`.
         */
        raw_hex?: string;
      };
      sct: {
        delivery_paths: string[];
        count: number;
      };
      alpn_offered: string[];
      encrypt_then_mac: ObservationBool;
      heartbeat_present: ObservationBool;
      truncated_hmac: ObservationBool;
      npn: ObservationBool;
      supported_point_formats_echoed: string[];
      /**
       * RFC 6066 §4 — server-echoed max_fragment_length code. `2^9`..`2^12` for values 1-4; `0xNN` for unknown bytes.
       */
      max_fragment_length?: string;
      /**
       * RFC 8449 — observed in TLS 1.3 EncryptedExtensions. Populated when the OpenSSL-backed EE probe (feature `legacy-probes`) completed a TLS 1.3 handshake and the server advertised the extension.
       */
      record_size_limit?: number;
      /**
       * RFC 8879 — server-advertised certificate compression algorithms. Populated via the OpenSSL EncryptedExtensions probe.
       */
      compress_certificate_algorithms?: string[];
      /**
       * RFC 9345 delegated-credentials observation. TLS 1.2 path emits presence-only via ServerHello ext 0x0022; TLS 1.3 path parses the leaf CertificateEntry extensions. The scanner records observable fields; it does not verify the DC signature or compare `valid_time` against the wall clock.
       */
      delegated_credentials: {
        value: ObservationBool;
        /**
         * RFC 9345 §4.1 — seconds from leaf cert `notBefore` at which the DC expires. Present only on the TLS 1.3 CertificateEntry path.
         */
        valid_time_seconds?: number;
        /**
         * Canonical IANA SignatureScheme name for the DC's signature (`ecdsa_secp256r1_sha256`, etc.), or `0xNNNN` for unknown codepoints. Present only on the TLS 1.3 CertificateEntry path.
         */
        expected_cert_verify_algorithm?: string;
        /**
         * Observation path that produced this record.
         */
        delivery_path?: "tls1_3_certificate_entry" | "tls1_2_server_hello";
      };
    };
    /**
     * Non-extension handshake observations — active vulnerability probes (Heartbleed payload echo, ephemeral-key reuse / Raccoon, ROBOT) plus ClientHello-body / ServerHello-variant signals (`compression_offered`, `hello_retry_request`, `grease_echoed`). Schema v2.0 split these out of `extensions`. Polarity (whether `true` is good or bad) varies per field; the scanner records facts and downstream rule engines interpret.
     */
    behavioral_probes: {
      heartbeat_echoes_oversized_payload: ObservationBool1;
      /**
       * Compression methods echoed by the server in the ServerHello `compression_methods` field (RFC 5246 §7.4.1.3 — body field, not an extension). Non-empty list = CRIME-vulnerable configuration (RFC 7457 §2.1).
       */
      compression_offered: string[];
      grease_echoed: ObservationBool2;
      hello_retry_request: ObservationBool3;
      /**
       * Ephemeral DH/ECDH public-value reuse observation (Raccoon signal, CVE-2020-1968). For each family the scanner runs two sequential TLS 1.2 handshakes against a supported suite and compares the server's ephemeral public value byte-for-byte. `true` = the server reused its ephemeral key across fresh handshakes; `false` = distinct keys; `not_probed` when no suite in the family was observed supported.
       */
      ephemeral_key_reuse: {
        dhe_public_reused_across_connections: ObservationBool;
        ecdhe_public_reused_across_connections: ObservationBool;
        /**
         * IANA name of the DHE suite pinned for the two reuse-detection handshakes. Absent when no DHE suite was observed supported.
         */
        dhe_suite_probed?: string;
        /**
         * IANA name of the ECDHE suite pinned for the two reuse-detection handshakes. Absent when no ECDHE suite was observed supported.
         */
        ecdhe_suite_probed?: string;
      };
      /**
       * Bleichenbacher / ROBOT differential probe. For each of five malformed PKCS#1 v1.5 `ClientKeyExchange` variants the scanner runs a fresh TLS 1.2 handshake against an RSA-kex suite, sends the malformed CKE + ChangeCipherSpec + a Finished placeholder, and records the server's response (alert category / TCP RST / timeout / graceful close). Scanner records the per-variant table; downstream rule engines compare. No `vulnerable` boolean is emitted.
       */
      bleichenbacher_oracle_probe: {
        /**
         * IANA name of the RSA-kex suite the probe pinned (`TLS_RSA_WITH_AES_128_CBC_SHA` today).
         */
        rsa_kex_suite_probed?: string;
        method: Method;
        reason?: string;
        /**
         * Exactly five entries in a stable variant order when `method` is `probe`; empty when `not_probed`.
         */
        per_variant: {
          variant:
            | "correctly_formatted_pkcs1"
            | "invalid_0x00_02_prefix"
            | "invalid_version_0x00_02_byte_swap"
            | "null_separator_missing"
            | "wrong_tls_version_in_pms";
          alert_category?: string;
          tcp_reset: boolean;
          elapsed_ms: number;
          /**
           * Non-alert, non-RST outcome: `timeout`, `graceful_close`, `unexpected_plaintext:<detail>`, `setup_error:<detail>`.
           */
          other_outcome?: string;
        }[];
      };
    };
    downgrade_signaling: {
      fallback_scsv_enforced: ObservationBool;
      /**
       * RFC 8446 §4.1.3 sentinel observed in the last 8 bytes of ServerRandom. Optional — absent when the hello probe never produced a ServerHello.
       */
      tls13_downgrade_sentinel?: "tls12" | "lte_tls11" | "none";
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
    session_resumption: SessionResumption;
    signature_algorithm_policy_probe: SigalgPolicyProbe;
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
    /**
     * RFC 9266 tls-exporter (TLS 1.3 only) and RFC 5929 §4 tls-server-end-point (SHA-256 of leaf cert DER).
     */
    channel_binding: {
      tls_exporter: ChannelBindingValue;
      tls_server_end_point: ChannelBindingValue;
    };
    /**
     * Per-ALPN-protocol probe matrix. One entry per probed token (h2, http/1.1, http/1.0). Complements `negotiated.alpn` — records which ALPNs the server accepts when offered alone, not just what it prefers when several are offered.
     */
    alpn_probe: {
      protocol: string;
      supported: boolean | null;
      method: Method;
      /**
       * Populated on `supported: false` or `method: error`. Canonical values: `no_application_protocol_alert` (RFC 7301 rejection), `server_returned_mismatched_alpn:<name>` (server picked a different ALPN than offered), `server_did_not_select_any_alpn`, `tls_alert_<name>` (unrelated alert), transport-level categories.
       */
      reason?: string;
    }[];
  };
  certificates: {
    leaf?: CertificateFacts;
    chain: CertificateFacts[];
    chain_length: number;
  };
  validation: {
    chain_valid_to_webpki_roots: ObservationBool;
    chain_valid_to_microsoft_roots: ObservationBool;
    chain_valid_to_apple_roots: ObservationBool;
    chain_valid_to_us_fpki_common_roots: ObservationBool;
    chain_valid_to_us_dod_roots: ObservationBool;
    /**
     * --extra-trust-store entries keyed by user-supplied name. Each value is a three-state observationBool under the same semantics as the compiled-in stores.
     */
    chain_valid_to_custom_roots?: {
      [k: string]: ObservationBool;
    };
    name_matches_sni: ObservationBool;
    validation_error?: string | null;
    /**
     * Per-store error strings — populated only for stores whose chain-validation attempt failed. Keys are canonical store names.
     */
    per_store_validation_errors?: {
      [k: string]: string;
    };
    /**
     * Provenance per trust store: `compiled_in` (build-time bundle), `cache_refreshed:<path>` (loaded from the cache written by `kemist --update-trust-stores`), or `runtime_override:<path>` (loaded from a user-supplied `--trust-store NAME:PATH`). One entry per store attempted.
     */
    trust_store_sources?: {
      [k: string]: string;
    };
    /**
     * Per-store manifest metadata for cache-refreshed bundles. Populated only for stores whose breadcrumb is `cache_refreshed:...`; compile-time and runtime-override loads omit their entry. Lets rule engines pin observations to a specific snapshot.
     */
    trust_store_bundle_metadata?: {
      [k: string]: {
        source: string;
        fetched_at: string;
        sha256: string;
        entry_count: number;
        upstream_version?: string;
      };
    };
  };
  http?: {
    enabled: boolean;
    hsts?: {};
    preload_list_status?: string;
    /**
     * Provenance of the HSTS preload snapshot used for this observation. `compiled_in` = the build-time Chromium snapshot bundled in the binary. `cache_refreshed:<path>` = the platform cache file written by `kemist --update-hsts-preload`. `runtime_override:<path>` = an override file supplied via `--hsts-preload-list-path`. Consumers comparing results across runs must check this — the `preload_list_status` value is only comparable under the same source snapshot.
     */
    preload_list_source?: string;
    security_txt?: {
      present?: boolean;
      url?: string;
      content_type?: string;
      body?: string;
      /**
       * Structured RFC 9116 decomposition. Each directive's values are collected in order of appearance.
       */
      parsed?: {
        contact?: string[];
        expires?: string;
        encryption?: string[];
        preferred_languages?: string[];
        canonical?: string[];
        policy?: string[];
        hiring?: string[];
        acknowledgments?: string[];
        pgp_signed?: boolean;
      };
    };
    /**
     * HTTP response headers beyond HSTS — CSP, frame-options, referrer-policy, permissions-policy, cross-origin family, Set-Cookie flags. Raw values preserved; cookie values intentionally omitted (potential session-token leak).
     */
    security_headers?: {
      content_security_policy?: string;
      content_security_policy_report_only?: string;
      x_frame_options?: string;
      x_content_type_options?: string;
      referrer_policy?: string;
      permissions_policy?: string;
      cross_origin_opener_policy?: string;
      cross_origin_embedder_policy?: string;
      cross_origin_resource_policy?: string;
      reporting_endpoints?: string;
      set_cookies?: {
        name: string;
        secure: boolean;
        http_only: boolean;
        /**
         * Canonical values: `Strict`, `Lax`, `None`. Other strings preserved as-sent.
         */
        same_site?: string;
      }[];
    };
    /**
     * Observed redirect chain for GET /, up to 10 hops. Terminal entry has a non-3xx status and no location.
     */
    redirect_chain?: {
      url: string;
      status: number;
      location?: string;
    }[];
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
  /**
   * FFDHE TLS 1.2 only. Classification of the prime the server actually returned when its behavior diverged from the codepoint we offered (or when cross-codepoint coherence determined the server isn't honoring `supported_groups`). Vocabulary mirrors `tls.dh_parameters[].classification`.
   */
  returned_group?:
    | "ffdhe2048"
    | "ffdhe3072"
    | "ffdhe4096"
    | "ffdhe6144"
    | "ffdhe8192"
    | "modp1024"
    | "modp1536"
    | "modp2048"
    | "modp3072"
    | "custom";
  /**
   * FFDHE TLS 1.2 only. Bit length of the prime the server actually returned. Useful primarily when `returned_group == "custom"`.
   */
  returned_prime_bits?: number;
}
/**
 * Parsed BasicOCSPResponse per RFC 6960 §4.2. Every field optional except `response_status`; parser is best-effort and tolerant of partial data.
 */
export interface OcspResponseContent {
  /**
   * RFC 6960 OCSPResponseStatus: successful, malformedRequest, internalError, tryLater, sigRequired, unauthorized, or unknown_<n>.
   */
  response_status: string;
  signature_algorithm_oid?: string;
  responder_id_by_name?: string;
  responder_id_by_key?: string;
  produced_at?: string;
  single_responses_count: number;
  cert_status?: "good" | "revoked" | "unknown";
  revocation_time?: string;
  revocation_reason?: string;
  this_update?: string;
  next_update?: string;
  cert_id?: {
    hash_algorithm_oid: string;
    issuer_name_hash_hex: string;
    issuer_key_hash_hex: string;
    serial_number_hex: string;
  };
}
export interface DhParametersObservation {
  cipher_suite: string;
  prime_bits: number;
  classification:
    | "ffdhe2048"
    | "ffdhe3072"
    | "ffdhe4096"
    | "ffdhe6144"
    | "ffdhe8192"
    | "modp1024"
    | "modp1536"
    | "modp2048"
    | "modp3072"
    | "custom";
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
/**
 * Session resumption observations. TLS 1.2 issuance + rotation + functional resumption (tickets and session-ID caching) populated via successive OpenSSL probe handshakes; TLS 1.3 PSK resumption + 0-RTT populated via a rustls-backed probe.
 */
export interface SessionResumption {
  tls1_2: {
    session_ticket_issued: ObservationBool;
    ticket_lifetime_hint_secs?: number;
    session_id_issued: ObservationBool;
    ticket_rotated_across_connections: ObservationBool;
    session_ticket_resumption_accepted: ObservationBool4;
    session_id_resumption_accepted: ObservationBool5;
  };
  tls1_3: {
    new_session_ticket_count?: number;
    ticket_lifetime_secs?: number[];
    psk_resumption_accepted: ObservationBool;
    early_data_accepted: ObservationBool;
  };
}
/**
 * Phase G — per-constraint outcomes from restricted signature_algorithms handshakes. Every slot always present; `method: not_probed` + reason when skipped or feature-disabled.
 */
export interface SigalgPolicyProbe {
  sha256_plus_only: ConstrainedProbeResult;
  ecdsa_only: ConstrainedProbeResult;
  rsa_pss_only: ConstrainedProbeResult;
  rsa_pkcs1_only: ConstrainedProbeResult;
  eddsa_only: ConstrainedProbeResult;
}
export interface ConstrainedProbeResult {
  outcome:
    | "handshake_complete"
    | "handshake_failure"
    | "connection_closed"
    | "other_alert"
    | "not_probed";
  selected_sigalg?: string;
  alert?: string;
  method: Method;
  reason?: string;
  /**
   * Lowercase hex SHA-256 of the DER of the leaf cert the server returned under this constraint. Populated only when the handshake completed. Two distinct values across the sigalg probe set signal a dual-cert deployment (e.g. RSA + ECDSA leaves).
   */
  leaf_fingerprint_sha256?: string;
  /**
   * Subject DN of the leaf cert returned under this constraint. Same formatting as `certificates.leaf.subject_dn`. Convenience for log correlation; the authoritative identifier is `leaf_fingerprint_sha256`.
   */
  leaf_subject_dn?: string;
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
  /**
   * Structured decomposition of the signature-algorithm identifier. `hash` is the canonical hash family (`sha256`, etc.) or absent for schemes that hash internally. `algorithm` is the family (`rsa`, `rsa_pss`, `ecdsa`, `ed25519`, `ml_dsa_65`, `slh_dsa_sha2_128s`, ...).
   */
  signature_algorithm_structured: {
    hash?: string;
    algorithm: string;
    parameters?: string;
  };
  /**
   * Present when the signature OID is PQC. Replaces the earlier `is_pqc_signature: bool` — a boolean `has_pqc = pqc_signature_family !== undefined` recovers the old semantics.
   */
  pqc_signature_family?: "ml_dsa" | "slh_dsa" | "composite";
  public_key: {
    algorithm: string;
    size_bits: number;
    curve?: string;
    curve_oid?: string;
    /**
     * RSA public exponent. Present only for RSA keys; values observed in practice are 3, 17, or 65537.
     */
    rsa_exponent?: number;
  };
  embedded_scts: number;
  fingerprint_sha256: string;
  fingerprint_sha1: string;
  /**
   * Position of this cert in the wire-order chain delivered by the server. `0` is the leaf; subsequent integers are intermediates in the order the server sent them. Duplicates are preserved (each copy carries its own position); parse failures appear as gaps in the sequence across `Certificates.chain`. Downstream rule engines observe chain ordering through this field directly.
   */
  wire_position: number;
  extensions?: CertExtensions;
  /**
   * Out-of-band revocation observations scoped to this cert. Populated only for the leaf and only when `--enable-revocation-fetch` is set. Distinct from `tls.extensions.ocsp_stapling`, which captures the server's in-band stapling behavior at the TLS layer (delivered regardless of cert scope).
   */
  revocation?: {
    /**
     * OCSP-over-HTTP fetch results — one entry per AIA OCSP URL queried.
     */
    ocsp_http_fallback?: {
      url: string;
      http_status?: number;
      response_length: number;
      content?: OcspResponseContent;
      error?: string;
    }[];
    /**
     * CRL fetch + revocation-check results — one entry per CRLDistributionPoints URL. `leaf_revoked: true/false/null` distinguishes definite revocation / definite not-revoked / inconclusive.
     */
    crl_fetch?: {
      url: string;
      http_status?: number;
      this_update?: string;
      next_update?: string;
      crl_issuer?: string;
      revoked_cert_count?: number;
      leaf_revoked?: boolean | null;
      revocation_time?: string;
      revocation_reason?: string;
      error?: string;
    }[];
  };
}
/**
 * X.509 v3 extension observations per RFC 5280 + RFC 7633 + RFC 6962. Every sub-field optional; absent means the extension was not present on the cert (or kemist could not parse it).
 */
export interface CertExtensions {
  basic_constraints?: {
    ca: boolean;
    path_len_constraint?: number;
  };
  key_usage?: {
    bits: string[];
  };
  extended_key_usage?: {
    oids: string[];
  };
  authority_key_identifier?: string;
  subject_key_identifier?: string;
  authority_information_access?: {
    ocsp: string[];
    ca_issuers: string[];
  };
  crl_distribution_points?: {
    urls: string[];
  };
  name_constraints?: {
    permitted_subtrees: string[];
    excluded_subtrees: string[];
  };
  certificate_policies?: {
    oids: string[];
  };
  must_staple?: boolean;
  scts?: {
    log_id: string;
    timestamp: string;
    signature_hash_algorithm: string;
    signature_algorithm: string;
    signature_hex: string;
  }[];
}
