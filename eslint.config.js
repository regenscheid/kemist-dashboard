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
      // The custom no-raw-value-read rule for schema-v1 observation
      // types (enforcing routing through src/lib/triState.ts) lands in
      // PR 2 once the helpers exist.
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
