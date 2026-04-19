import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // TanStack Router codegen emits src/routeTree.gen.ts; it's regenerated
  // on every build and not edited by hand.
  globalIgnores(["dist", "src/routeTree.gen.ts", "coverage", "playwright-report"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Pattern A guard: forbid direct reads of the tri-state
      // `value` / `offered` / `supported` fields. The scanner's
      // tri-state contract is only preserved when you route through
      // src/lib/triState.ts (isAffirmative, isUnknown, etc.) — a
      // naked `.value` read on a schema-v1 observation silently
      // collapses `null` into `false` at a condition site.
      //
      // Overrides below re-enable it for the helper module itself,
      // the generated schema types, tests, and transform code that
      // legitimately needs the raw field.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name=/^(value|offered|supported)$/]",
          message:
            "Direct .value/.offered/.supported reads on tri-state observations collapse null into false. Route through src/lib/triState.ts (isAffirmative, classify, extractValue).",
        },
      ],
    },
  },
  {
    // Files that legitimately need raw access to the tri-state
    // fields: the helpers themselves, generated schema types, test
    // files, and (once PR 3 lands) the scan-transform pipeline.
    files: [
      "src/lib/triState.ts",
      "src/data/schema.ts",
      "scripts/**/*.{ts,mjs,js}",
      "**/*.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    // TanStack Router's file-based routing has each route file export
    // `Route` alongside the component — the react-refresh rule can't
    // reason about this pattern cleanly, so we disable it here.
    // Fast Refresh still works for the component bodies themselves.
    files: ["src/routes/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
]);
