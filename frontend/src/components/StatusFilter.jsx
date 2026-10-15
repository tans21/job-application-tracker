import { useCallback } from "react";
import { useGridFilter } from "ag-grid-react";
import { STATUSES, statusColor } from "../statuses";

/**
 * Custom AG Grid filter for the Status column (Community-friendly set filter).
 * Shows the 7 statuses as checkboxes; the selected values are sent to the
 * server as { values: [...] } for an IN-clause filter.
 */
export default function StatusFilter({ model, onModelChange }) {
  // Server-side filtering: the grid re-queries on model change, so this is unused.
  const doesFilterPass = useCallback(() => true, []);
  useGridFilter({ doesFilterPass });

  const selected = model?.values ?? [];

  const toggle = (s) => {
    const next = selected.includes(s)
      ? selected.filter((x) => x !== s)
      : [...selected, s];
    onModelChange(next.length ? { values: next } : null);
  };

  return (
    <div className="status-filter">
      {STATUSES.map((s) => {
        const color = statusColor(s);
        return (
          <label key={s} className="status-filter-row">
            <input
              type="checkbox"
              checked={selected.includes(s)}
              onChange={() => toggle(s)}
            />
            <span
              className="pill"
              style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
            >
              {s}
            </span>
          </label>
        );
      })}
      {selected.length > 0 && (
        <button className="status-filter-clear" onClick={() => onModelChange(null)}>
          Clear
        </button>
      )}
    </div>
  );
}
