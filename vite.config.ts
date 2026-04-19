// Using vitest/config's defineConfig — it re-exports Vite's defineConfig
// with the `test` property typed, so we can configure Vitest inline.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// kemist-dashboard is deployed as a GitHub Pages project site at
// /kemist-dashboard/. The `base` option rewrites all bundler paths to
// that prefix; locally (pnpm dev / vitest) base resolves to "/".
const REPO_BASE = "/kemist-dashboard/";

export default defineConfig(({ command }) => ({
  base: command === "build" ? REPO_BASE : "/",
  plugins: [
    // TanStack Router's codegen plugin must run BEFORE @vitejs/plugin-react
    // so that the generated route tree is picked up by the React transformer.
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
      // Keep co-located tests (*.test.{ts,tsx}) out of the route tree.
      routeFileIgnorePattern: "\\.(test|spec)\\.",
    }),
    react(),
    tailwind(),
  ],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: false,
    // Keep Playwright's e2e specs out of Vitest's run — they use a
    // different runner and expect a live server.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/e2e/**",
    ],
  },
}));
