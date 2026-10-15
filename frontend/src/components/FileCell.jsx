import { useRef, useState } from "react";
import { api } from "../api";

/**
 * Cell renderer for the Resume / Cover Letter columns.
 * Shows a Download link when a file exists and an upload button that
 * accepts .docx files.
 */
export default function FileCell({ data, colDef, context }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  if (!data) return ""; // row block still loading (infinite row model)

  const kind = colDef.cellRendererParams.kind; // "resume" | "cover-letter"
  const hasFile =
    kind === "resume" ? data.has_resume : data.has_cover_letter;
  const downloadUrl =
    kind === "resume" ? api.resumeUrl(data.id) : api.coverLetterUrl(data.id);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await api.uploadFile(data.id, kind, file);
      await context.refresh();
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      {hasFile && (
        <>
          <a
            className="grid-link link-preview"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              context.preview(data.id, kind, `${colDef.headerName} — ${data.company_name}`);
            }}
          >
            Preview
          </a>
          <a
            className="grid-link link-download"
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </>
      )}
      <button onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "…" : hasFile ? "Replace" : "Upload"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        style={{ display: "none" }}
        onChange={onPick}
      />
    </div>
  );
}
