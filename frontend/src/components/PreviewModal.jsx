import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Fetches a document's rendered HTML and shows it in a modal so the user
 * can read it without downloading. `kind` is "resume" | "cover-letter" | "jd".
 */
export default function PreviewModal({ jobId, kind, title, onClose }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .fetchPreview(jobId, kind)
      .then((h) => active && setHtml(h))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [jobId, kind]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal preview-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preview-header">
          <h2>{title}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <a
              className="grid-link"
              href={api.previewUrl(jobId, kind)}
              target="_blank"
              rel="noreferrer"
            >
              Open in new tab
            </a>
            <button onClick={onClose}>Close</button>
          </div>
        </div>

        {error && <p style={{ color: "#c0392b" }}>Could not load preview: {error}</p>}
        {!html && !error && <p>Loading…</p>}
        {html && (
          <div
            className="doc-preview"
            // Content is the user's own document rendered by mammoth (no scripts).
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
