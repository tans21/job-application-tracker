import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STATUSES, statusColor } from "../statuses";

/**
 * Status cell: shows a colored pill. Clicking it opens a colored dropdown
 * (rendered in a portal so it is never clipped by the grid) and selecting a
 * value updates the row immediately via context.updateField.
 */
export default function StatusCell({ data, context }) {
  const value = data?.application_status;
  const color = statusColor(value);
  const pillRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (open && pillRef.current) {
      const r = pillRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        pillRef.current &&
        !pillRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!data) return ""; // row block still loading (infinite row model)

  function pick(s) {
    setOpen(false);
    if (s !== value) context.updateField(data.id, "application_status", s);
  }

  return (
    <>
      <span
        ref={pillRef}
        className="pill status-pill-btn"
        style={{ color, background: `color-mix(in srgb, ${color} 18%, transparent)` }}
        onClick={() => setOpen((o) => !o)}
        title="Click to change status"
      >
        {value} ▾
      </span>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="status-editor"
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
          >
            {STATUSES.map((s) => {
              const c = statusColor(s);
              return (
                <div
                  key={s}
                  className={`status-option${s === value ? " selected" : ""}`}
                  onClick={() => pick(s)}
                >
                  <span
                    className="pill"
                    style={{ color: c, background: `color-mix(in srgb, ${c} 18%, transparent)` }}
                  >
                    {s}
                  </span>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
