import { Link, Outlet, createRootRoute } from "@tanstack/react-router";

// App shell — nav + router outlet + later, <ProvenanceStrip />. Every
// route renders below this so the shell persists across navigation.
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 text-sm">
          <Link to="/" className="font-semibold">
            kemist-dashboard
          </Link>
          <Link
            to="/"
            className="hover:underline [&.active]:font-semibold"
            activeOptions={{ exact: true }}
          >
            Summary
          </Link>
          <Link
            to="/domains"
            className="hover:underline [&.active]:font-semibold"
          >
            Domains
          </Link>
          <Link
            to="/about"
            className="ml-auto hover:underline [&.active]:font-semibold"
          >
            About
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
