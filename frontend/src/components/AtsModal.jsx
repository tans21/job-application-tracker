const GROUPS = [
  { key: "hard_skills", label: "Hard Skills", color: "#3b82f6" },
  { key: "tools_technologies", label: "Tools & Technologies", color: "#a855f7" },
  { key: "soft_skills", label: "Soft Skills", color: "#22c55e" },
  { key: "keywords", label: "Other ATS Keywords", color: "#f59e0b" },
];

/**
 * Renders the stored ATS keyword analysis (a JSON string) as colored chips
 * grouped by category, with the summary at the top.
 */
export default function AtsModal({ title, atsJson, onClose, onRegenerate, busy }) {
  let data = null;
  let parseError = false;
  try {
    data = JSON.parse(atsJson);
  } catch {
    parseError = true;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-header">
          <h2>{title}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onRegenerate} disabled={busy}>
              {busy ? "Regenerating…" : "↻ Regenerate"}
            </button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        {parseError && <p style={{ color: "var(--st-rejected)" }}>Could not read saved keywords.</p>}

        {data && (
          <div className="ats-body">
            {data.summary && <p className="ats-summary">{data.summary}</p>}
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
