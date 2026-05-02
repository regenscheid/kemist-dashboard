// Using vitest/config's defineConfig — it re-exports Vite's defineConfig
// with the `test` property typed, so we can configure Vitest inline.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// kemist-dashboard is published as a GitHub Pages project site. Two
// possible URL shapes:
//
//   default                  https://regenscheid.github.io/kemist-dashboard/
//                            → base must be `/kemist-dashboard/` so
//                              asset URLs resolve under the project
//                              subpath.
//   GH Pages custom domain   https://www.kemist-tls.net/
//                            → GitHub Pages serves the project at the
//                              root of the configured custom domain;
//                              base must be `/`.
//
// To deploy under the custom domain, set `BASE_PATH=/` in the build's
// env (in the deploy workflow, or `BASE_PATH=/ pnpm build` locally).
// Defaults to the project subpath; dev / vitest always use `/`.
const DEFAULT_BUILD_BASE = "/kemist-dashboard/";
const buildBase = process.env["BASE_PATH"] ?? DEFAULT_BUILD_BASE;

export default defineConfig(({ command }) => ({
  base: command === "build" ? buildBase : "/",
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
  define: {
    __APP_BUILD_ID__: JSON.stringify(new Date().toISOString()),
  },
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
