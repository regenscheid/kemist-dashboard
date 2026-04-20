import type { KemistScanResultSchemaV1 } from "./schema";
import { extractValue } from "../lib/triState";

export const KX_SUPPORT_ORDER = [
  "pure_pqc",
  "pqc_hybrid",
  "ecc",
  "rsa",
  "ffdh",
] as const;

export type KxSupportType = (typeof KX_SUPPORT_ORDER)[number];

export const KX_SUPPORT_LABELS: Record<KxSupportType, string> = {
  pure_pqc: "Pure PQC",
  pqc_hybrid: "PQC Hybrid",
  ecc: "ECC",
  rsa: "RSA",
  ffdh: "FFDH",
};

export const PQC_HYBRID_GROUPS = [
  "X25519MLKEM768",
  "secp256r1MLKEM768",
  "secp384r1MLKEM1024",
] as const;

export const PQC_STANDALONE_GROUPS = [
  "MLKEM512",
  "MLKEM768",
  "MLKEM1024",
] as const;

export const ECC_GROUPS = [
  "X25519",
  "X448",
  "secp256r1",
  "secp384r1",
  "secp521r1",
] as const;

export function compareKxSupportTypes(a: string, b: string): number {
  return KX_SUPPORT_ORDER.indexOf(a as KxSupportType) -
    KX_SUPPORT_ORDER.indexOf(b as KxSupportType);
}

export function classifyKxGroupName(
  name: string | null | undefined,
): Exclude<KxSupportType, "rsa"> | null {
  if (!name) return null;
  if ((PQC_HYBRID_GROUPS as readonly string[]).includes(name)) {
    return "pqc_hybrid";
  }
  if ((PQC_STANDALONE_GROUPS as readonly string[]).includes(name)) {
    return "pure_pqc";
  }
  if ((ECC_GROUPS as readonly string[]).includes(name)) {
    return "ecc";
  }
  if (/^ffdhe\d+$/i.test(name)) {
    return "ffdh";
  }
  return null;
}

export function classifyKxCipherSuiteName(
  name: string | null | undefined,
): KxSupportType | null {
  if (!name) return null;
  if (/^(?:SSL|TLS)_RSA(?:_PSK)?_WITH_/i.test(name)) {
    return "rsa";
  }
  if (/^(?:SSL|TLS)_ECDH/i.test(name)) {
    return "ecc";
  }
  if (/^(?:SSL|TLS)_(?:DHE|DH)_/i.test(name)) {
    return "ffdh";
  }
  return null;
}

export function deriveKxSupportTypes(
  tls: KemistScanResultSchemaV1["tls"],
): KxSupportType[] {
  const found = new Set<KxSupportType>();

  for (const groupMap of [tls.groups.tls1_2, tls.groups.tls1_3]) {
    for (const [name, observation] of Object.entries(groupMap)) {
      if (extractValue(observation) !== true) continue;
      const category = classifyKxGroupName(name);
      if (category) found.add(category);
    }
  }

  const negotiatedCategory = classifyKxGroupName(tls.negotiated?.group);
  if (negotiatedCategory) {
    found.add(negotiatedCategory);
  }

  const suites = [
    ...tls.cipher_suites.tls1_0,
    ...tls.cipher_suites.tls1_1,
    ...tls.cipher_suites.tls1_2,
    ...tls.cipher_suites.tls1_3,
  ];
  for (const suite of suites) {
    if (suite.supported !== true) continue;
    const category = classifyKxCipherSuiteName(suite.name);
    if (category) found.add(category);
  }

  return KX_SUPPORT_ORDER.filter((category) => found.has(category));
}
