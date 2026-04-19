/**
 * Dev-only component gallery for the tri-state primitives. Renders
 * every TriStateClass across all three presentational variants so
 * reviewers can eyeball-audit the rendering rules.
 *
 * Only linked from this file; the production nav doesn't surface it.
 * The route still ships with the bundle — acceptable cost for now;
 * move under a build-time env flag if size pressure mounts.
 */
import { createFileRoute } from "@tanstack/react-router";
import fixture from "../../fixtures/tri-state-edge-cases.json";
import { TriState } from "../components/TriState";
import { TriStateText } from "../components/TriStateText";
import type { TriStateInput } from "../lib/triState";

export const Route = createFileRoute("/dev/tristate")({
  component: TriStateGalleryRoute,
});

const ex = fixture as unknown as Record<string, TriStateInput>;

// Ordered list of representative observations — one per class.
// Includes both schema shapes that use each field name so the gallery
// doubles as a shape-shaking sanity check.
const cases: Array<{ key: string; title: string }> = [
  { key: "observation_bool_affirmative", title: "Affirmative (probe + true)" },
  {
    key: "observation_bool_explicit_negative",
    title: "Explicit negative (probe + false)",
  },
  {
    key: "observation_bool_connection_state_true",
    title: "Connection state + true",
  },
  {
    key: "observation_bool_connection_state_false",
    title: "Connection state + false",
  },
  { key: "observation_bool_not_probed", title: "Unknown: not probed" },
  {
    key: "observation_bool_not_applicable",
    title: "Unknown: not applicable",
  },
  { key: "observation_bool_error", title: "Unknown: probe errored" },
  { key: "version_offered_affirmative", title: "Shape: versionOffered" },
  { key: "group_observation_not_probed", title: "Shape: groupObservation" },
  {
    key: "cipher_suite_entry_affirmative",
    title: "Shape: cipherSuiteEntry",
  },
];

function TriStateGalleryRoute() {
  return (
    <section aria-labelledby="gallery-heading" className="space-y-6">
      <h1
        id="gallery-heading"
        className="text-2xl font-semibold tracking-tight"
      >
        Tri-state primitives — component gallery
      </h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Every <code>TriStateClass</code> rendered through each of the three
        presentational variants.
      </p>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left dark:border-slate-800">
            <th className="py-2 pr-4 font-medium">Case</th>
            <th className="py-2 pr-4 font-medium">&lt;TriState&gt; pill</th>
            <th className="py-2 pr-4 font-medium">&lt;TriStateText&gt;</th>
          </tr>
        </thead>
        <tbody>
          {cases.map(({ key, title }) => {
            const obs = ex[key];
            if (!obs) return null;
            return (
              <tr
                key={key}
                className="border-b border-slate-100 dark:border-slate-800/50"
              >
                <td className="py-2 pr-4 align-top">
                  <div className="font-medium">{title}</div>
                  <div className="text-xs text-slate-500">{key}</div>
                </td>
                <td className="py-2 pr-4 align-top">
                  <TriState observation={obs} />
                </td>
                <td className="py-2 pr-4 align-top">
                  <TriStateText observation={obs} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
