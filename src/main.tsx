import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";
import { routeTree } from "./routeTree.gen";

// TanStack Router codegen produces routeTree.gen.ts at build time from
// files in src/routes/. See vite.config.ts for the plugin config.
const router = createRouter({
  routeTree,
  // GitHub Pages project sites serve under /kemist-dashboard/ — matches
  // vite.config.ts's `base`. Router must know about it so navigation
  // stays inside the app shell.
  basepath: import.meta.env.BASE_URL,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
