import { useState } from "react";

/**
 * ATS column cell:
 *  - no JD saved        -> disabled "Generate" with a hint
 *  - JD, no keywords    -> "Generate" button
 *  - generating         -> spinner label
 *  - keywords present   -> "View" link + "↻" regenerate button
 */
export default function AtsCell({ data, context }) {
  const [busy, setBusy] = useState(false);

  if (!data) return ""; // row block still loading (infinite row model)

  async function run() {
    setBusy(true);
    try {
      await context.generateAts(data.id);
    } catch (err) {
      alert(`Generation failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!data.has_jd) {
    return (
      <span style={{ color: "var(--muted)" }} title="Add a job description first">
        — no JD
      </span>
    );
  }

  if (busy) {
    return <span style={{ color: "var(--muted)" }}>Generating…</span>;
  }

  if (!data.has_ats) {
    return (
      <button className="primary" onClick={run}>
        Generate
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <a
        className="grid-link link-preview"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          context.openAts(data);
        }}
      >
        View
      </a>
      <button onClick={run} title="Regenerate & save">
        ↻
      </button>
    </div>
  );
}
