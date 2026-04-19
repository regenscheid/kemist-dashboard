import { createFileRoute } from "@tanstack/react-router";

// PR 7 fills this in: methodology, Pattern A disclosure, opt-out path,
// scanner + schema version badges.
export const Route = createFileRoute("/about")({
  component: AboutRoute,
});

function AboutRoute() {
  return (
    <section aria-labelledby="about-heading">
      <h1 id="about-heading" className="text-2xl font-semibold tracking-tight">
        About
      </h1>
      <p className="mt-2 text-slate-600 dark:text-slate-400">
        Methodology, opt-out procedure, and reproducibility notes. Populated by
        PR 7.
      </p>
    </section>
  );
}
