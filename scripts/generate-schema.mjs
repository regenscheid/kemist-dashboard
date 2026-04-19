#!/usr/bin/env node
// Generates `src/data/schema.ts` from the vendored kemist JSON Schema
// at `schemas/output-v1.json`. Run via `pnpm schema:generate`.
//
// Workflow:
//   1. Operator copies a new `output-v1.json` from the scanner repo
//      into `schemas/` (or runs `pnpm schema:update` when that lands).
//   2. Runs `pnpm schema:generate` to regenerate this file.
//   3. Commits both the schema and the regenerated .ts.
//
// Deterministic (same input → same output). Diffs in `src/data/schema.ts`
// should always be reviewable against a schema diff.

import { compileFromFile } from "json-schema-to-typescript";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const schemaPath = path.join(repoRoot, "schemas", "output-v1.json");
const outPath = path.join(repoRoot, "src", "data", "schema.ts");

const banner = `/* eslint-disable */
/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Source: schemas/output-v1.json (vendored from kemist-scanner).
 * Regenerate with: pnpm schema:generate
 */`;

const ts = await compileFromFile(schemaPath, {
  bannerComment: banner,
  style: {
    singleQuote: false,
    semi: true,
    trailingComma: "all",
    printWidth: 100,
  },
  // Stricter output: additionalProperties=false in the schema → no
  // index signature in the generated type.
  additionalProperties: false,
  // Field names in the schema are snake_case; preserve them.
  enableConstEnums: false,
});

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, ts, "utf8");

console.log(`Wrote ${path.relative(repoRoot, outPath)} (${ts.length} bytes)`);
