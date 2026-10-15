import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  colorSchemeDark,
} from "ag-grid-community";

import { api } from "./api";
import FileCell from "./components/FileCell";
import AddJobModal from "./components/AddJobModal";
import PreviewModal from "./components/PreviewModal";
import StatusCell from "./components/StatusCell";
import StatusFilter from "./components/StatusFilter";
import AtsCell from "./components/AtsCell";
import AtsModal from "./components/AtsModal";
import CompatCell from "./components/CompatCell";
import CompatModal from "./components/CompatModal";
import DeleteCell from "./components/DeleteCell";

ModuleRegistry.registerModules([AllCommunityModule]);

// Dark theme for AG Grid tuned to match the app surface colors.
const gridTheme = themeQuartz.withPart(colorSchemeDark).withParams({
  accentColor: "#3b82f6",
  backgroundColor: "#141b2b",
  foregroundColor: "#e6e9f0",
  headerBackgroundColor: "#1e2738",
  borderColor: "#2a3346",
  oddRowBackgroundColor: "#171f2f",
  rowHoverColor: "#1e2738",
  fontSize: 13,
});

// ---- Cell renderers --------------------------------------------------------
function LinkCell({ value }) {
  if (!value) return "";
  return (
    <a className="grid-link" href={value} target="_blank" rel="noreferrer">
      Open
    </a>
  );
}

// Date applied: show the stored date or an em dash.
function DateCell({ value }) {
  if (!value) return <span style={{ color: "var(--muted)" }}>—</span>;
  return value;
}

// Recruiter email: render as a mailto link (still editable on double-click).
function MailCell({ value }) {
  if (!value) return "";
  return (
    <a className="grid-link" href={`mailto:${value}`}>
      {value}
    </a>
  );
}

// Clickable badge for boolean columns; toggles on click.
function BoolBadge({ data, colDef, context }) {
  if (!data) return ""; // row block still loading (infinite row model)
  const on = !!data[colDef.field];
  return (
    <span
      className={`bool-badge${on ? " on" : ""}`}
      title={on ? "Yes (click to toggle)" : "No (click to toggle)"}
      onClick={() => context.updateField(data.id, colDef.field, !on)}
    >
      {on ? "✓" : "·"}
    </span>
  );
}

function JdCell({ data, context }) {
  const [busy, setBusy] = useState(false);

  if (!data) return "";

  async function fetchJd() {
    setBusy(true);
    try {
      await context.generateJd(data.id);
    } catch (err) {
      alert(`Could not fetch JD: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <span style={{ color: "var(--muted)" }}>Fetching…</span>;

  // No JD yet: offer to fetch from the link (if there is one).
  if (!data.has_jd) {
    if (!data.job_link) return <span style={{ color: "var(--muted)" }}>—</span>;
    return (
      <button className="primary" onClick={fetchJd} title="Fetch JD from the job link">
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
          context.preview(data.id, "jd", `JD — ${data.company_name}`);
        }}
      >
        Preview
      </a>
      <a
        className="grid-link link-download"
        href={api.jdUrl(data.id)}
        target="_blank"
        rel="noreferrer"
      >
        Download
      </a>
      {data.job_link && (
        <button onClick={fetchJd} title="Re-fetch JD from the job link">
          ↻
        </button>
      )}
    </div>
  );
}

// ---- Stat cards ------------------------------------------------------------
function StatCards({ stats }) {
  const cards = [
    { label: "Total", value: stats?.total ?? "—" },
    { label: "Applied", value: stats?.applied ?? "—" },
    { label: "Interviews", value: stats?.interviews ?? "—" },
    { label: "Offers", value: stats?.offers ?? "—" },
    { label: "Response rate", value: stats ? `${stats.response_rate}%` : "—" },
  ];

  return (
    <div className="stats">
      {cards.map((s) => (
        <div className="stat-card" key={s.label}>
          <div className="value">{s.value}</div>
          <div className="label">{s.label}</div>
          <div className="accent-bar" />
        </div>
      ))}
    </div>
  );
}

// ---- Column hide/show dropdown --------------------------------------------
function ColumnsMenu({ columns, hidden, onToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button onClick={() => setOpen((o) => !o)}>Columns ▾</button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 8,
            zIndex: 20,
            minWidth: 180,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {columns.map((c) => (
            <label
              key={c.colId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 6px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={!hidden[c.colId]}
                onChange={() => onToggle(c.colId)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- App -------------------------------------------------------------------
export default function App() {
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef(""); // datasource reads the latest search value
  const [showModal, setShowModal] = useState(false);
  const [preview, setPreview] = useState(null);
  const [ats, setAts] = useState(null); // the row whose ATS keywords are shown
  const [atsBusy, setAtsBusy] = useState(false);
  const [compat, setCompat] = useState(null); // row whose compatibility is shown
  const [compatBusy, setCompatBusy] = useState(false);
  const [error, setError] = useState(null);
  const [hidden, setHidden] = useState({});
  const gridApiRef = useRef(null);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.fetchStats());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Reload the current page(s) from the server and refresh the stat cards.
  const refresh = useCallback(async () => {
    gridApiRef.current?.refreshInfiniteCache();
    await refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // AG Grid infinite-row-model datasource: fetches one block (page) at a time.
  const datasource = useMemo(
    () => ({
      getRows: async (params) => {
        try {
          const { items, total } = await api.fetchJobsPage({
            startRow: params.startRow,
            endRow: params.endRow,
            sortModel: params.sortModel,
            filterModel: params.filterModel,
            search: searchRef.current,
          });
          // lastRow tells the grid the total count (for the pager).
          params.successCallback(items, total);
          setError(null);
        } catch (err) {
          setError(err.message);
          params.failCallback();
        }
      },
    }),
    []
  );

  const updateField = useCallback(
    async (id, field, value) => {
      try {
        await api.updateJob(id, { [field]: value });
        await refresh();
      } catch (err) {
        alert(`Update failed: ${err.message}`);
      }
    },
    [refresh]
  );

  const openPreview = useCallback((jobId, kind, title) => {
    setPreview({ jobId, kind, title });
  }, []);

  const generateJd = useCallback(
    async (id) => {
      const updated = await api.generateJd(id);
      await refresh();
      return updated;
    },
    [refresh]
  );

  const deleteJob = useCallback(
    async (id) => {
      if (!confirm("Delete this job? This cannot be undone.")) return;
      try {
        await api.deleteJob(id);
        await refresh();
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    },
    [refresh]
  );

  const generateAts = useCallback(
    async (id) => {
      const updated = await api.generateAts(id);
      await refresh();
      // If the viewer is open for this row, refresh its content too.
      setAts((cur) => (cur && cur.id === id ? updated : cur));
      return updated;
    },
    [refresh]
  );

  const openAts = useCallback((row) => setAts(row), []);

  const generateCompat = useCallback(
    async (id) => {
      const updated = await api.generateCompatibility(id);
      await refresh();
      setCompat((cur) => (cur && cur.id === id ? updated : cur));
      return updated;
    },
    [refresh]
  );

  const openCompat = useCallback((row) => setCompat(row), []);

  const context = useMemo(
    () => ({
      refresh,
      updateField,
      preview: openPreview,
      deleteJob,
      generateJd,
      generateAts,
      openAts,
      generateCompat,
      openCompat,
    }),
    [refresh, updateField, openPreview, deleteJob, generateJd, generateAts, openAts, generateCompat, openCompat]
  );

  const onCellValueChanged = useCallback(
    (e) => {
      const field = e.colDef.field;
      if (["job_id", "company_name", "job_link", "application_status", "recruiter_email"].includes(field)) {
        updateField(e.data.id, field, e.newValue);
      }
    },
    [updateField]
  );

  const columnDefs = useMemo(
    () => [
      { headerName: "Job Id", field: "job_id", colId: "job_id", editable: true, width: 130, pinned: "left", filter: "agTextColumnFilter" },
      { headerName: "Company", field: "company_name", colId: "company_name", editable: true, flex: 1, minWidth: 150, filter: "agTextColumnFilter" },
      { headerName: "Job Link", field: "job_link", colId: "job_link", editable: true, cellRenderer: LinkCell, width: 110 },
      {
        headerName: "Status",
        field: "application_status",
        colId: "application_status",
        cellRenderer: StatusCell,
        filter: StatusFilter,
        width: 170,
      },
      { headerName: "Date Applied", field: "applied_date", colId: "applied_date", cellRenderer: DateCell, width: 140 },
      { headerName: "Referral", field: "used_referral", colId: "used_referral", cellRenderer: BoolBadge, width: 110 },
      { headerName: "Cold Email", field: "cold_email", colId: "cold_email", cellRenderer: BoolBadge, width: 120 },
      { headerName: "Recruiter Email", field: "recruiter_email", colId: "recruiter_email", editable: true, cellRenderer: MailCell, filter: "agTextColumnFilter", width: 220 },
      { headerName: "Resume", colId: "resume", cellRenderer: FileCell, cellRendererParams: { kind: "resume" }, width: 210, sortable: false, filter: false },
      { headerName: "Cover Letter", colId: "cover_letter", cellRenderer: FileCell, cellRendererParams: { kind: "cover-letter" }, width: 220, sortable: false, filter: false },
      { headerName: "JD", colId: "jd", cellRenderer: JdCell, width: 150, sortable: false, filter: false },
      { headerName: "ATS Keywords", colId: "ats", cellRenderer: AtsCell, width: 150, sortable: false, filter: false },
      { headerName: "Compatibility", colId: "compat", cellRenderer: CompatCell, width: 190, sortable: false, filter: false },
      { headerName: "", colId: "delete", cellRenderer: DeleteCell, width: 70, sortable: false, filter: false },
    ],
    []
  );

  // Column list for the hide/show menu.
  const columnList = useMemo(
    () => columnDefs.map((c) => ({ colId: c.colId, label: c.headerName || "Delete" })),
    [columnDefs]
  );

  const toggleColumn = useCallback((colId) => {
    setHidden((prev) => {
      const next = { ...prev, [colId]: !prev[colId] };
      gridApiRef.current?.setColumnsVisible([colId], !next[colId]);
      return next;
    });
  }, []);

  const onGridReady = useCallback(
    (params) => {
      gridApiRef.current = params.api;
      Object.entries(hidden).forEach(([colId, isHidden]) => {
        if (isHidden) params.api.setColumnsVisible([colId], false);
      });
    },
    [hidden]
  );

  // Debounced search: update the value the datasource reads, then reload.
  const onSearchChange = useCallback((value) => {
    setSearch(value);
    searchRef.current = value;
    gridApiRef.current?.refreshInfiniteCache();
  }, []);

  const defaultColDef = useMemo(
    // Server handles filtering via the search box, so disable column filters.
    () => ({ resizable: true, sortable: true, filter: false }),
    []
  );

  return (
    <div className="app">
      <div className="app-header">
        <div>
          <h1>Job Application Tracker</h1>
          <div className="subtitle">Track applications, resumes, cover letters & JDs</div>
        </div>
        <button className="primary" onClick={() => setShowModal(true)}>
          + Add Job
        </button>
      </div>

      <StatCards stats={stats} />

      <div className="grid-wrap">
        <div className="toolbar">
          <input
            className="search-input"
            type="text"
            placeholder="Search company or job id…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <ColumnsMenu columns={columnList} hidden={hidden} onToggle={toggleColumn} />
          <button onClick={refresh}>Refresh</button>
          {error && <span style={{ color: "var(--st-rejected)" }}>Error: {error}</span>}
        </div>

        <div style={{ height: 560, width: "100%" }}>
          <AgGridReact
            theme={gridTheme}
            rowModelType="infinite"
            datasource={datasource}
            pagination={true}
            paginationPageSize={50}
            paginationPageSizeSelector={[10, 50, 100]}
            cacheBlockSize={100}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            context={context}
            onCellValueChanged={onCellValueChanged}
            onGridReady={onGridReady}
            getRowId={(p) => String(p.data.id)}
            rowHeight={44}
          />
        </div>
      </div>

      {showModal && (
        <AddJobModal onClose={() => setShowModal(false)} onCreated={refresh} />
      )}


      {preview && (
        <PreviewModal
          jobId={preview.jobId}
          kind={preview.kind}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}

      {ats && (
        <AtsModal
          title={`ATS Keywords — ${ats.company_name}`}
          atsJson={ats.ats_keywords}
          busy={atsBusy}
          onClose={() => setAts(null)}
          onRegenerate={async () => {
            setAtsBusy(true);
            try {
              await generateAts(ats.id);
            } catch (err) {
              alert(`Regeneration failed: ${err.message}`);
            } finally {
              setAtsBusy(false);
            }
          }}
        />
      )}

      {compat && (
        <CompatModal
          title={`Compatibility — ${compat.company_name}`}
          compatJson={compat.compatibility}
          busy={compatBusy}
          onClose={() => setCompat(null)}
          onRegenerate={async () => {
            setCompatBusy(true);
            try {
              await generateCompat(compat.id);
            } catch (err) {
              alert(`Re-scoring failed: ${err.message}`);
            } finally {
              setCompatBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
