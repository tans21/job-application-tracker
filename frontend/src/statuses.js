export const STATUSES = [
  "Saved",
  "Applied",
  "Online Assessment",
  "Interview",
  "Offer",
  "Rejected",
  "Ghosted",
];

// Each status maps to a concrete color (used for pills, dropdown, and form).
export const STATUS_COLOR = {
  Saved: "#64748b",
  Applied: "#f59e0b",
  "Online Assessment": "#a855f7",
  Interview: "#3b82f6",
  Offer: "#22c55e",
  Rejected: "#ef4444",
  Ghosted: "#94a3b8",
};

export const statusColor = (s) => STATUS_COLOR[s] || "#64748b";

// Color for a 0-100 compatibility score: red (low) -> amber -> green (high).
export function scoreColor(score) {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#f59e0b";
  return "#ef4444";
}
