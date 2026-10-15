import { scoreColor } from "../statuses";

const GROUPS = [
  { key: "matched", label: "Matched", color: "#22c55e" },
  { key: "missing", label: "Missing / Gaps", color: "#ef4444" },
];

/** Renders the stored JD/resume compatibility analysis (JSON string). */
export default function CompatModal({ title, compatJson, onClose, onRegenerate, busy }) {
  let data = null;
  let parseError = false;
  try {
    data = JSON.parse(compatJson);
  } catch {
    parseError = true;
  }

  const score = data?.score ?? 0;
  const color = scoreColor(score);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <h2>{title}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onRegenerate} disabled={busy}>
              {busy ? "Re-scoring…" : "↻ Re-score"}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        {parseError && <p style={{ color: "var(--st-rejected)" }}>Could not read saved score.</p>}

        {data && (
          <div className="ats-body">
            <div className="compat-score-row">
              <div className="compat-score" style={{ color, borderColor: color }}>
                {score}%
              </div>
              <div className="compat-bar-wrap">
                <div className="compat-bar-track">
                  <div
                    className="compat-bar-fill"
                    style={{ width: `${score}%`, background: color }}
                  />
                </div>
                {data.summary && <p className="compat-summary">{data.summary}</p>}
              </div>
            </div>

            {GROUPS.map((g) => {
              const items = Array.isArray(data[g.key]) ? data[g.key] : [];
              if (!items.length) return null;
              return (
                <div key={g.key} className="ats-group">
                  <div className="ats-group-label">{g.label}</div>
                  <div className="ats-chips">
                    {items.map((item, i) => (
                      <span
                        key={`${g.key}-${i}`}
                        className="ats-chip"
                        style={{
                          color: g.color,
                          borderColor: `color-mix(in srgb, ${g.color} 45%, transparent)`,
                          background: `color-mix(in srgb, ${g.color} 14%, transparent)`,
                        }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
