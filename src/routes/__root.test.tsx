import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

// Smoke-test the app shell nav. The `routeTree.gen.ts` file is built
// by the TanStack Router Vite plugin, so unit tests construct a
// minimal in-memory tree instead of importing the generated tree.
describe("root route shell", () => {
  it("renders the sticky header with the three primary tabs", async () => {
    // Load the root route component lazily to avoid circular-dep
    // surprises when the generated tree is stale.
    const { Route: RootRouteDef } = await import("./__root");
    const rootRoute = createRootRoute({
      component: RootRouteDef.options.component!,
    });
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <p>home</p>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([homeRoute]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    // TanStack Router renders asynchronously after mount — use
    // findByRole (polling) for the first assertion to wait out the
    // initial load, then synchronous getByRole for the rest.
    expect(
      await screen.findByRole("link", { name: /kemist dashboard home/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Summary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Federal Websites" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Top 20k Websites" }),
    ).toBeInTheDocument();
  });
});
