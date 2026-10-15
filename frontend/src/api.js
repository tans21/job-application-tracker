const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (_) {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  base: API_BASE,

  // Server-side pagination: returns { items, total }.
  fetchJobsPage({ startRow, endRow, sortModel, search, filterModel }) {
    const params = new URLSearchParams({
      limit: String(endRow - startRow),
      offset: String(startRow),
    });
    if (sortModel && sortModel.length) {
      params.set("sort", sortModel[0].colId);
      params.set("order", sortModel[0].sort);
    }
    if (search) params.set("search", search);
    if (filterModel && Object.keys(filterModel).length) {
      params.set("filters", JSON.stringify(filterModel));
    }
    return fetch(`${API_BASE}/api/jobs?${params}`).then(handle);
  },

  fetchStats() {
    return fetch(`${API_BASE}/api/jobs/stats`).then(handle);
  },

  fetchJdFromLink(jobLink) {
    return fetch(`${API_BASE}/api/jobs/fetch-jd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_link: jobLink }),
    }).then(handle);
  },

  createJob(data) {
    return fetch(`${API_BASE}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle);
  },

  updateJob(id, data) {
    return fetch(`${API_BASE}/api/jobs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(handle);
  },

  deleteJob(id) {
    return fetch(`${API_BASE}/api/jobs/${id}`, { method: "DELETE" }).then(handle);
  },

  generateJd(id) {
    return fetch(`${API_BASE}/api/jobs/${id}/fetch-jd`, { method: "POST" }).then(handle);
  },

  generateAts(id) {
    // Local model call; can take ~30-60s, so no client timeout.
    return fetch(`${API_BASE}/api/jobs/${id}/ats-keywords`, {
      method: "POST",
    }).then(handle);
  },

  generateCompatibility(id) {
    return fetch(`${API_BASE}/api/jobs/${id}/compatibility`, {
      method: "POST",
    }).then(handle);
  },

  uploadFile(id, kind, file) {
    // kind: "resume" | "cover-letter"
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_BASE}/api/jobs/${id}/${kind}`, {
      method: "POST",
      body: form,
    }).then(handle);
  },

  // Download URLs (open directly in the browser).
  resumeUrl: (id) => `${API_BASE}/api/jobs/${id}/resume`,
  coverLetterUrl: (id) => `${API_BASE}/api/jobs/${id}/cover-letter`,
  jdUrl: (id) => `${API_BASE}/api/jobs/${id}/jd`,

  // Preview endpoints return rendered HTML.
  previewUrl: (id, kind) => `${API_BASE}/api/jobs/${id}/${kind}/preview`,

  fetchPreview(id, kind) {
    return fetch(`${API_BASE}/api/jobs/${id}/${kind}/preview`).then(async (res) => {
      if (!res.ok) {
        let detail = res.statusText;
        try {
          detail = (await res.json()).detail || detail;
        } catch (_) {
          /* ignore */
        }
        throw new Error(detail);
      }
      return res.text();
    });
  },
};
