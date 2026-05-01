import type { KemistScanResultSchemaV2 } from "./schema";
import { extractValue } from "../lib/triState";

export const TLS_VERSION_DISPLAY_ORDER = [
  "SSL 2.0",
  "SSL 3.0",
  "TLS 1.0",
  "TLS 1.1",
  "TLS 1.2",
  "TLS 1.3",
  "(unknown)",
] as const;

export type TlsVersionLabel = (typeof TLS_VERSION_DISPLAY_ORDER)[number];

type VersionKey = keyof KemistScanResultSchemaV2["tls"]["versions_offered"];

const VERSION_KEY_LABELS: Record<VersionKey, Exclude<TlsVersionLabel, "(unknown)">> = {
  ssl2: "SSL 2.0",
  ssl3: "SSL 3.0",
  tls1_0: "TLS 1.0",
  tls1_1: "TLS 1.1",
  tls1_2: "TLS 1.2",
  tls1_3: "TLS 1.3",
};

const VERSION_RANK = new Map(
  TLS_VERSION_DISPLAY_ORDER.map((label, index) => [label, index]),
);

const RAW_VERSION_LABELS: Record<string, Exclude<TlsVersionLabel, "(unknown)">> = {
  "SSL 2.0": "SSL 2.0",
  SSLv2: "SSL 2.0",
  SSLv2_0: "SSL 2.0",
  "SSL 3.0": "SSL 3.0",
  SSLv3: "SSL 3.0",
  TLSv1: "TLS 1.0",
  TLSv1_0: "TLS 1.0",
  "TLS 1.0": "TLS 1.0",
  "TLSv1.0": "TLS 1.0",
  TLSv1_1: "TLS 1.1",
  "TLS 1.1": "TLS 1.1",
  "TLSv1.1": "TLS 1.1",
  TLSv1_2: "TLS 1.2",
  "TLS 1.2": "TLS 1.2",
  "TLSv1.2": "TLS 1.2",
  TLSv1_3: "TLS 1.3",
  "TLS 1.3": "TLS 1.3",
  "TLSv1.3": "TLS 1.3",
};

export function normalizeTlsVersionLabel(
  raw: string | null | undefined,
): Exclude<TlsVersionLabel, "(unknown)"> | null {
  if (!raw) return null;
  return RAW_VERSION_LABELS[raw] ?? null;
}

export function deriveSupportedTlsVersions(
  versionsOffered: KemistScanResultSchemaV2["tls"]["versions_offered"],
): Exclude<TlsVersionLabel, "(unknown)">[] {
  return (Object.entries(VERSION_KEY_LABELS) as Array<[
    VersionKey,
    Exclude<TlsVersionLabel, "(unknown)">,
  ]>)
    .filter(([key]) => extractValue(versionsOffered[key]) === true)
    .map(([, label]) => label);
}

export function deriveMaxSupportedTlsVersion(
  versionsOffered: KemistScanResultSchemaV2["tls"]["versions_offered"],
): Exclude<TlsVersionLabel, "(unknown)"> | null {
  const supported = deriveSupportedTlsVersions(versionsOffered);
  return supported.at(-1) ?? null;
}

export function compareTlsVersionLabels(a: string, b: string): number {
  return (VERSION_RANK.get(a as TlsVersionLabel) ?? Number.MAX_SAFE_INTEGER) -
    (VERSION_RANK.get(b as TlsVersionLabel) ?? Number.MAX_SAFE_INTEGER);
}
