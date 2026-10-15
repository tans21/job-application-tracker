import { useState } from "react";
import { scoreColor } from "../statuses";

/**
 * Compatibility column cell:
 *  - missing JD or resume -> hint (needs both)
 *  - ready, no score      -> "Score" button
 *  - scoring              -> spinner
 *  - score present        -> colored % + "View" + "↻" regenerate
 */
export default function CompatCell({ data, context }) {
  const [busy, setBusy] = useState(false);

  if (!data) return ""; // row block still loading (infinite row model)

  async function run() {
    setBusy(true);
    try {
      await context.generateCompat(data.id);
    } catch (err) {
      alert(`Scoring failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (!data.has_jd || !data.has_resume) {
    return (
      <span style={{ color: "var(--muted)" }} title="Needs a JD and an uploaded resume">
        — need JD + resume
      </span>
    );
  }

  if (busy) {
    return <span style={{ color: "var(--muted)" }}>Scoring…</span>;
  }

  if (!data.has_compatibility) {
    return (
      <button className="primary" onClick={run}>
        Score
      </button>
    );
  }

  let score = null;
  try {
    score = JSON.parse(data.compatibility).score;
  } catch {
    /* ignore */
  }
  const color = scoreColor(score ?? 0);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span
        className="pill"
        style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)`, fontWeight: 700 }}
      >
        {score != null ? `${score}%` : "—"}
      </span>
      <a
        className="grid-link link-preview"
        href="#"
        onClick={(e) => {
          e.preventDefault();
          context.openCompat(data);
        }}
      >
        View
      </a>
      <button onClick={run} title="Re-score & save">
        ↻
      </button>
    </div>
  );
}
