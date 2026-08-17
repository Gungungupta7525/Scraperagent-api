(() => {
  "use strict";

  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

  const searchSection = $("#search-section");
  const resultsSection = $("#results-section");
  const candidatesList = $("#candidates-list");
  const loadingState = $("#loading-state");
  const emptyState = $("#empty-state");
  const errorState = $("#error-state");
  const errorDetail = $("#error-detail");
  const resultsTitle = $("#results-title");
  const resultsStats = $("#results-stats");
  const resultsFilters = $("#results-filters");
  const thresholdSlider = $("#threshold-slider");
  const thresholdValue = $("#threshold-value");
  const input = $("#input");
  const sendBtn = $("#send-btn");
  const composer = $("#composer");
  const suggestionsEl = $("#suggestions");
  const statusEl = $("#api-status");
  const settingsBtn = $("#settings-btn");
  const settingsModal = $("#settings-modal");
  const candidateModal = $("#candidate-modal");
  const candidateDetail = $("#candidate-detail");

  const LS_URL = "scraperagent.api_base_url";
  const LS_KEY = "scraperagent.api_key";
  const LS_SHORTLIST = "scraperagent.shortlist";

  const SUGGESTIONS = [
    "Senior Python backend engineer with FastAPI and AWS",
    "Data scientist with machine learning and NLP experience",
    "Senior SAP ABAP Developer with S/4HANA, CDS Views, OData",
    "React frontend developer, TypeScript, startup experience",
  ];

  let busy = false;
  let allCandidates = [];
  let shortlisted = new Set(JSON.parse(localStorage.getItem(LS_SHORTLIST) || "[]"));
  let activeFilter = "all";
  let threshold = 0;
  let lastJobDescription = "";

  function saveShortlist() {
    localStorage.setItem(LS_SHORTLIST, JSON.stringify([...shortlisted]));
  }

  /* ---------- settings ---------- */
  const settings = {
    get baseUrl() {
      return (localStorage.getItem(LS_URL) || CONFIG.API_BASE_URL).replace(/\/+$/, "");
    },
    get apiKey() {
      return localStorage.getItem(LS_KEY) ?? CONFIG.API_KEY ?? "";
    },
  };

  /* ---------- helpers ---------- */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function escapeHtml(v) {
    const d = document.createElement("div");
    d.textContent = String(v ?? "");
    return d.innerHTML;
  }

  function setStatus(state, label) {
    statusEl.className = "api-status" + (state ? ` ${state}` : "");
    statusEl.textContent = label;
  }

  function matchCategory(score) {
    if (score >= 0.70) return "strong";
    if (score >= 0.40) return "good";
    return "review";
  }

  function matchLabel(cat) {
    if (cat === "strong") return "Strong Match";
    if (cat === "good") return "Good Match";
    return "Needs Review";
  }

  /* ---------- source icons ---------- */
  const SOURCE_ICONS = {
    github: '<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
  };
  const SOURCE_NAMES = {
    github: "GitHub", linkedin: "LinkedIn", wellfound: "Wellfound",
    indeed: "Indeed", stackoverflow: "Stack Overflow", kaggle: "Kaggle",
    devto: "DEV.to", hashnode: "Hashnode", artstation: "ArtStation",
    dribbble: "Dribbble", researchgate: "ResearchGate", orcid: "ORCID",
    producthunt: "Product Hunt", indiehackers: "Indie Hackers",
    huggingface: "Hugging Face", google: "Google Scholar",
  };

  function sourceHtml(source) {
    const icon = SOURCE_ICONS[source] || "";
    const name = SOURCE_NAMES[source] || source;
    return icon ? `<span class="cand-source">${icon} ${escapeHtml(name)}</span>` : `<span class="cand-source">${escapeHtml(name)}</span>`;
  }

  /* ---------- rendering ---------- */

  function renderResults(data) {
    allCandidates = data.candidates || [];
    lastJobDescription = input.value.trim() || lastJobDescription;
    applyFilter();
  }

  function applyFilter() {
    const filtered = allCandidates.filter((c) => {
      const score = c.relevance_score || 0;
      if (score * 100 < threshold) return false;
      if (activeFilter === "all") return true;
      return matchCategory(score) === activeFilter;
    });
    renderStats();
    renderCards(filtered);
  }

  function renderStats() {
    const counts = { strong: 0, good: 0, review: 0 };
    allCandidates.forEach((c) => {
      const score = c.relevance_score || 0;
      if (score * 100 >= threshold) counts[matchCategory(score)]++;
    });
    resultsStats.innerHTML = "";
    resultsStats.appendChild(el("span", "stat stat-strong", `${counts.strong} Strong Match`));
    resultsStats.appendChild(el("span", "stat stat-good", `${counts.good} Good Match`));
    resultsStats.appendChild(el("span", "stat stat-review", `${counts.review} Needs Review`));
    const total = counts.strong + counts.good + counts.review;
    resultsTitle.textContent = `${total} Candidate${total !== 1 ? "s" : ""} Found`;
  }

  function renderCards(candidates) {
    candidatesList.innerHTML = "";
    if (candidates.length === 0) {
      candidatesList.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }
    emptyState.classList.add("hidden");
    candidatesList.classList.remove("hidden");
    candidates.forEach((c, i) => candidatesList.appendChild(candidateCard(c, i)));
  }

  function candidateCard(c, index) {
    const score = c.relevance_score || 0;
    const pct = Math.round(score * 100);
    const cat = matchCategory(score);
    const isShortlisted = shortlisted.has(c.url);

    const card = el("div", "candidate");

    const top = el("div", "cand-top");
    const info = el("div", "cand-info");
    info.appendChild(el("div", "cand-name", c.name || `Candidate ${index + 1}`));
    const roleText = c.role || c.headline || "";
    if (roleText) info.appendChild(el("div", "cand-role", roleText));
    if (c.experience) info.appendChild(el("div", "cand-experience", c.experience));
    top.appendChild(info);

    const scoreBlock = el("div", "cand-score");
    scoreBlock.appendChild(el("div", `score-number ${cat}`, `${pct}%`));
    scoreBlock.appendChild(el("div", "score-label", matchLabel(cat)));
    top.appendChild(scoreBlock);
    card.appendChild(top);

    const bar = el("div", "cand-match-bar");
    bar.appendChild(el("div", `cand-match-fill ${cat}`));
    bar.lastChild.style.width = `${pct}%`;
    card.appendChild(bar);

    if (Array.isArray(c.skills) && c.skills.length) {
      const skills = el("div", "cand-skills");
      c.skills.slice(0, 8).forEach((s) => {
        const tag = el("span", "skill matched", s);
        skills.appendChild(tag);
      });
      card.appendChild(skills);
    }

    if (c.summary) {
      card.appendChild(el("div", "cand-summary", c.summary));
    }

    const footer = el("div", "cand-footer");
    const meta = el("div", "cand-meta");
    if (c.location) meta.appendChild(el("span", "cand-location", "\uD83D\uDCCD " + c.location));
    if (c.source) {
      const src = document.createElement("span");
      src.innerHTML = sourceHtml(c.source);
      meta.appendChild(src);
    }
    if (c.url) {
      const link = el("a", "cand-link", c.url.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      link.href = c.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      meta.appendChild(link);
    }
    footer.appendChild(meta);

    const actions = el("div", "cand-actions");
    const viewBtn = el("button", "btn-sm primary", "View Profile");
    viewBtn.addEventListener("click", () => showCandidateDetail(c, index));
    actions.appendChild(viewBtn);

    const shortBtn = el("button", `btn-sm${isShortlisted ? " shortlisted" : ""}`, isShortlisted ? "Shortlisted" : "Shortlist");
    shortBtn.addEventListener("click", () => {
      if (shortlisted.has(c.url)) {
        shortlisted.delete(c.url);
        shortBtn.className = "btn-sm";
        shortBtn.textContent = "Shortlist";
      } else {
        shortlisted.add(c.url);
        shortBtn.className = "btn-sm shortlisted";
        shortBtn.textContent = "Shortlisted";
      }
      saveShortlist();
    });
    actions.appendChild(shortBtn);
    footer.appendChild(actions);

    card.appendChild(footer);
    return card;
  }

  /* ---------- candidate detail modal ---------- */

  function showCandidateDetail(c, index) {
    const score = c.relevance_score || 0;
    const pct = Math.round(score * 100);
    const cat = matchCategory(score);

    let html = `<div class="detail-header">
      <div>
        <div class="detail-name">${escapeHtml(c.name || `Candidate ${index + 1}`)}</div>
        <div class="detail-role">${escapeHtml(c.role || c.headline || "")}</div>
      </div>
      <div class="detail-score score-number ${cat}">${pct}%</div>
    </div>`;

    if (c.skills && c.skills.length) {
      html += `<div class="detail-section"><h3>Matched Skills</h3><div class="detail-skills">`;
      c.skills.forEach((s) => { html += `<span class="skill matched">${escapeHtml(s)}</span>`; });
      html += `</div></div>`;
    }

    if (lastJobDescription) {
      html += `<div class="detail-section"><h3>Why This Candidate Matches</h3>`;
      html += `<div class="detail-match-text">${escapeHtml(generateMatchExplanation(c, lastJobDescription))}</div></div>`;
    }

    html += `<div class="detail-section"><h3>Details</h3><table class="requirement-table">`;
    if (c.location) html += `<tr><td>Location</td><td>${escapeHtml(c.location)}</td></tr>`;
    if (c.experience) html += `<tr><td>Experience</td><td>${escapeHtml(c.experience)}</td></tr>`;
    html += `<tr><td>Source</td><td>${escapeHtml(SOURCE_NAMES[c.source] || c.source || "Unknown")}</td></tr>`;
    if (c.url) {
      html += `<tr><td>Profile</td><td><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="cand-link">View Profile</a></td></tr>`;
    }
    html += `</table></div>`;

    if (c.summary) {
      html += `<div class="detail-section"><h3>Summary</h3><div class="detail-match-text">${escapeHtml(c.summary)}</div></div>`;
    }

    candidateDetail.innerHTML = html;
    candidateModal.classList.remove("hidden");
  }

  function generateMatchExplanation(c, jd) {
    const skills = c.skills || [];
    const jdLower = jd.toLowerCase();
    const parts = [];
    if (c.name) parts.push(`${c.name} is a strong candidate`);
    else parts.push("This is a strong candidate");

    if (skills.length > 0) {
      parts.push(`with demonstrated experience in ${skills.join(", ")}`);
    }
    const role = c.role || c.headline || "";
    if (role) parts.push(`currently working as ${role}`);
    if (c.experience) parts.push(`with ${c.experience}`);

    const pct = Math.round((c.relevance_score || 0) * 100);
    parts.push(`Matching ${pct}% of the job requirements.`);

    return parts.join(" ") + " ";
  }

  /* ---------- suggestions ---------- */

  function renderSuggestions() {
    suggestionsEl.innerHTML = "";
    SUGGESTIONS.forEach((s) => {
      const chip = el("button", "sugg", s);
      chip.type = "button";
      chip.addEventListener("click", () => {
        input.value = s;
        input.dispatchEvent(new Event("input"));
        input.focus();
      });
      suggestionsEl.appendChild(chip);
    });
  }

  /* ---------- health ---------- */

  async function checkHealth() {
    try {
      const res = await fetch(`${settings.baseUrl}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        setStatus("ok", data.mode === "llm+heuristic" ? "API online (LLM)" : "API online");
      } else {
        setStatus("err", "API error");
      }
    } catch {
      setStatus("err", "API offline");
    }
  }

  /* ---------- send ---------- */

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;

    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    autoResize();
    lastJobDescription = text;

    searchSection.classList.add("compact");
    resultsSection.classList.remove("hidden");
    candidatesList.classList.add("hidden");
    emptyState.classList.add("hidden");
    errorState.classList.add("hidden");
    loadingState.classList.remove("hidden");
    resultsTitle.textContent = "Searching...";
    resultsStats.innerHTML = "";
    candidatesList.innerHTML = "";

    try {
      const controller = new AbortController();
      const res = await fetch(`${settings.baseUrl}/scraping-agent?stream=1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
        },
        body: JSON.stringify({ job_description: text, max_candidates: CONFIG.MAX_CANDIDATES }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        const body = await res.json().catch(() => ({}));
        if (body.detail) detail = body.detail;
        if (res.status === 401) detail = "401 Unauthorized — open Settings and add your API key.";
        if (res.status === 503) detail = "503 Upstream failure — the backend couldn't reach a search provider.";
        throw Object.assign(new Error(detail), { apiStatus: res.status });
      }

      if (!res.body) throw new Error("The API did not return a stream.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let result = null;

      const handleLine = (line) => {
        const msg = JSON.parse(line);
        if (msg.type === "status") {
          resultsTitle.textContent = msg.message;
        } else if (msg.type === "result") {
          result = msg.data;
        } else if (msg.type === "error") {
          throw Object.assign(new Error(msg.detail || "API error"), { apiStatus: msg.status_code });
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          handleLine(line);
          if (result) break;
        }
        if (result) break;
      }

      if (!result && buf.trim()) {
        try { result = JSON.parse(buf.trim()); } catch { /* ignore */ }
      }

      loadingState.classList.add("hidden");

      if (result) {
        renderResults(result);
      } else {
        emptyState.classList.remove("hidden");
        resultsTitle.textContent = "No Candidates Found";
      }
    } catch (err) {
      loadingState.classList.add("hidden");
      errorState.classList.remove("hidden");
      errorDetail.textContent = err.message || "An unknown error occurred.";
      resultsTitle.textContent = "Search Failed";
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  }

  /* ---------- composer ---------- */

  function autoResize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 300)}px`;
  }

  /* ---------- settings ---------- */

  function openSettings() {
    $("#settings-url").value = settings.baseUrl;
    $("#settings-key").value = settings.apiKey;
    settingsModal.classList.remove("hidden");
  }

  function saveSettings() {
    const url = $("#settings-url").value.trim().replace(/\/+$/, "");
    if (url) localStorage.setItem(LS_URL, url);
    const key = $("#settings-key").value.trim();
    localStorage.setItem(LS_KEY, key);
    settingsModal.classList.add("hidden");
    setStatus("", "\u2026");
    checkHealth();
  }

  /* ---------- sources dropdown ---------- */

  function initSourcesMenu() {
    const btn = $("#sources-btn");
    const menu = $("#sources-menu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("hidden");
      btn.setAttribute("aria-expanded", String(!open));
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    });
  }

  /* ---------- init ---------- */

  function init() {
    renderSuggestions();
    initSourcesMenu();

    input.addEventListener("input", autoResize);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
    });
    composer.addEventListener("submit", (e) => { e.preventDefault(); send(); });
    settingsBtn.addEventListener("click", openSettings);
    $("#settings-save").addEventListener("click", saveSettings);
    $("#settings-cancel").addEventListener("click", () => settingsModal.classList.add("hidden"));
    settingsModal.querySelector(".modal-backdrop").addEventListener("click", () => settingsModal.classList.add("hidden"));

    $("#new-search-btn").addEventListener("click", () => {
      searchSection.classList.remove("compact");
      resultsSection.classList.add("hidden");
      loadingState.classList.add("hidden");
      emptyState.classList.add("hidden");
      errorState.classList.add("hidden");
      candidatesList.innerHTML = "";
      input.value = "";
      input.focus();
    });

    $("#retry-btn").addEventListener("click", send);

    $("#candidate-close").addEventListener("click", () => candidateModal.classList.add("hidden"));
    candidateModal.querySelector(".modal-backdrop").addEventListener("click", () => candidateModal.classList.add("hidden"));

    resultsFilters.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      $$(".filter-btn", resultsFilters).forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      applyFilter();
    });

    thresholdSlider.addEventListener("input", () => {
      threshold = parseInt(thresholdSlider.value, 10);
      thresholdValue.textContent = `${threshold}%`;
      applyFilter();
    });

    setStatus("", "checking\u2026");
    checkHealth();
  }

  init();
})();
