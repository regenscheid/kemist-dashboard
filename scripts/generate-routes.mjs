#!/usr/bin/env node
// Regenerate src/routeTree.gen.ts without running a full Vite build.
//
// TanStack Router's Vite plugin produces the generated route tree
// during `vite build` / `vite dev`. CI runs typecheck before build
// (usual order so type errors fail fast), so we need a way to
// refresh the tree standalone.

import { Generator, getConfig } from "@tanstack/router-generator";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const config = getConfig(
  {
    target: "react",
    autoCodeSplitting: true,
    routesDirectory: "./src/routes",
    generatedRouteTree: "./src/routeTree.gen.ts",
    routeFileIgnorePattern: "\\.(test|spec)\\.",
  },
  repoRoot,
);

const generator = new Generator({ config, root: repoRoot });
await generator.run();

console.log("Regenerated src/routeTree.gen.ts");
