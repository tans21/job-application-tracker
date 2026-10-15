import { useState } from "react";
import { api } from "../api";
import { STATUSES, statusColor } from "../statuses";

const EMPTY = {
  job_id: "",
  company_name: "",
  job_link: "",
  application_status: "Saved",
  used_referral: false,
  cold_email: false,
  recruiter_email: "",
  jd_text: "",
};

export default function AddJobModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [fetchingJd, setFetchingJd] = useState(false);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function fetchJd() {
    if (!form.job_link.trim()) {
      alert("Enter the job link first");
      return;
    }
    setFetchingJd(true);
    try {
      const { jd_text } = await api.fetchJdFromLink(form.job_link.trim());
      set("jd_text", jd_text);
    } catch (err) {
      alert(`Could not fetch JD: ${err.message}`);
    } finally {
      setFetchingJd(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.company_name.trim()) {
      alert("Company name is required");
      return;
    }
    setSaving(true);
    try {
      await api.createJob(form);
      await onCreated();
      onClose();
    } catch (err) {
      alert(`Could not create job: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Job</h2>
        <form onSubmit={submit}>
          <div className="field">
            <label>Job Id</label>
            <input
              type="text"
              value={form.job_id}
              onChange={(e) => set("job_id", e.target.value)}
              placeholder="e.g. REQ-12345"
            />
          </div>
          <div className="field">
            <label>Company name *</label>
            <input
              type="text"
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Job link</label>
            <input
              type="url"
              value={form.job_link}
              onChange={(e) => set("job_link", e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="field">
            <label>Application status</label>
            <select
              value={form.application_status}
              onChange={(e) => set("application_status", e.target.value)}
              style={{ color: statusColor(form.application_status), fontWeight: 600 }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s} style={{ color: statusColor(s) }}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field checkbox">
            <input
              id="used_referral"
              type="checkbox"
              checked={form.used_referral}
              onChange={(e) => set("used_referral", e.target.checked)}
            />
            <label htmlFor="used_referral">Used referral</label>
          </div>
          <div className="field checkbox">
            <input
              id="cold_email"
              type="checkbox"
              checked={form.cold_email}
              onChange={(e) => set("cold_email", e.target.checked)}
            />
            <label htmlFor="cold_email">Cold email</label>
          </div>
          <div className="field">
            <label>Recruiter email</label>
            <input
              type="email"
              value={form.recruiter_email}
              onChange={(e) => set("recruiter_email", e.target.value)}
              placeholder="recruiter@company.com"
            />
          </div>
          <div className="field">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <label>Job description (saved as .docx)</label>
              <button
                type="button"
                onClick={fetchJd}
                disabled={fetchingJd || !form.job_link.trim()}
                title="Fetch the JD from the job link using AI"
              >
                {fetchingJd ? "Fetching…" : "✨ Fetch from link"}
              </button>
            </div>
            <textarea
              rows={6}
              value={form.jd_text}
              onChange={(e) => set("jd_text", e.target.value)}
              placeholder="Paste the JD text here… or use “Fetch from link”."
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
