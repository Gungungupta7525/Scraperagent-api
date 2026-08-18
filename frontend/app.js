(() => {
  "use strict";

  const $ = (s, p) => (p || document).querySelector(s);
  const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

  /* --- DOM refs --- */
  const searchSection = $("#search-section");
  const resultsSection = $("#results-section");
  const candidatesList = $("#candidates-list");
  const skeletonList = $("#skeleton-list");
  const emptyState = $("#empty-state");
  const errorState = $("#error-state");
  const errorDetail = $("#error-detail");
  const resultsTitle = $("#results-title");
  const resultsStats = $("#results-stats");
  const input = $("#input");
  const sendBtn = $("#send-btn");
  const composer = $("#composer");
  const suggestionsEl = $("#suggestions");
  const statusEl = $("#api-status");
  const settingsBtn = $("#settings-btn");
  const settingsModal = $("#settings-modal");
  const candidateModal = $("#candidate-modal");
  const candidateDetail = $("#candidate-detail");
  const filterModal = $("#filter-modal");
  const bottomBar = $("#bottom-bar");
  const bottomCount = $("#bottom-count");
  const bottomFilterBtn = $("#bottom-filter-btn");
  const bottomSortBtn = $("#bottom-sort-btn");
  const streamStatus = $("#stream-status");

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
  let activeSort = "score";
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
  const SOURCES = {
    github:       { name: "GitHub",          color: "#24292f", icon: '<svg viewBox="0 0 16 16" width="12" height="12"><path fill="#fff" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' },
    linkedin:     { name: "LinkedIn",        color: "#0A66C2", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' },
    wellfound:    { name: "Wellfound",      color: "#000000", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V9h2v7zm4 0h-2V9h2v7z"/></svg>' },
    indeed:       { name: "Indeed",         color: "#2164F3", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M4 4h16v16H4V4zm4.5 4.5c0-.83.67-1.5 1.5-1.5h4c.83 0 1.5.67 1.5 1.5v1c0 .83-.67 1.5-1.5 1.5h-1v5.5h-2V11h-1c-.83 0-1.5-.67-1.5-1.5v-1z"/></svg>' },
    stackoverflow:{ name: "Stack Overflow",  color: "#F48024", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M15 20H5v-2h10v2zm2-4H7v-2h10v2zm2-4H9V8h10v4zM3 4v16h18V4H3z"/></svg>' },
    kaggle:       { name: "Kaggle",         color: "#20BEFF", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' },
    devto:        { name: "DEV.to",         color: "#0A0A0A", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M7.42 10c0-.47.28-.87.7-1.16L12 5.88l3.88 2.96c.42.29.7.69.7 1.16V17c0 .55-.45 1-1 1H8.42c-.55 0-1-.45-1-1v-7z"/></svg>' },
    hashnode:     { name: "Hashnode",       color: "#2962FF", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.18L17.18 7 12 9.82 6.82 7 12 4.18z"/></svg>' },
    artstation:   { name: "ArtStation",     color: "#13ADA5", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M0 17.723l2.027 3.505h.001a2.424 2.424 0 002.164 1.333h13.457l-2.792-4.838H0zm24-2.49l-4.397-7.618a2.428 2.428 0 00-2.107-1.222H7.384l5.364 9.291 11.252.002z"/></svg>' },
    dribbble:     { name: "Dribbble",       color: "#EA4C89", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="10" fill="#EA4C89"/><path fill="#fff" d="M8.56 7.06c1.17 1.51 1.92 3.37 2.16 5.36-1.07-.15-2.15-.15-2.99.01-.15-1.07.53-2.13 1.44-2.93l.39-.44zM12 2a10 10 0 00-3.35.58c.81 1.14 1.27 2.52 1.27 3.97 0 .38-.04.75-.11 1.12.74-.13 1.54-.16 2.33-.07.24-1.16.77-2.22 1.51-3.07A10 10 0 0012 2zM7.04 16.11c.4-1.86 1.45-3.56 2.98-4.83.84.72 1.76 1.32 2.74 1.76-.17.61-.54 1.15-1.04 1.52l-.14.1c-.77.54-1.35 1.3-1.55 2.17l-.01.04c-.19.63-.27 1.29-.24 1.94H5.86a4.07 4.07 0 011.18-2.7z"/></svg>' },
    researchgate: { name: "ResearchGate",   color: "#00D0AF", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M19.586 0c-1.16 0-2.236.56-3.037 1.425L13.1 5.07a4.39 4.39 0 00-2.1 2.03l-.014.03-.014.028c-.454.897-.687 1.886-.687 2.89 0 .37.04.736.118 1.095l-2.28 2.28C5.644 12.217 4.27 11.02 3.36 9.58a4.02 4.02 0 00-.79 1.14l-.01.03-.007.025c-.37.853-.556 1.78-.556 2.74 0 1.67.67 3.19 1.76 4.29A6.02 6.02 0 006.42 20a5.95 5.95 0 004.24-1.76l2.88-2.88a4.35 4.35 0 002.1-1.07l4.24-5.26A3.12 3.12 0 0021.7 7.5a3.12 3.12 0 00-2.116-3.9V3.6C20.42 3.6 21 3.02 21 2.3S20.42 1 19.7 1h-.114z"/></svg>' },
    orcid:        { name: "ORCID",          color: "#A6CE39", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm-1.5 18.9h-3v-9h3v9zM9.75 8.4a1.8 1.8 0 110-3.6 1.8 1.8 0 010 3.6zm11.25 10.5h-3v-4.59c0-1.04-.02-2.38-1.45-2.38-1.45 0-1.67 1.14-1.67 2.31V17.4h-3v-9h2.89v1.23h.04c.4-.76 1.37-1.56 2.83-1.56 3.03 0 3.59 2 3.59 4.6V18.9z"/></svg>' },
    producthunt:  { name: "Product Hunt",   color: "#DA552F", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 24C5.37 24 0 18.63 0 12S5.37 0 12 0s12 5.37 12 12-5.37 12-12 12zM9.6 8.4h4.8v3.6H9.6V8.4zm0 5.4h4.8v3.6H9.6v-3.6z"/></svg>' },
    indiehackers:  { name: "Indie Hackers",  color: "#0F1C2E", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
    huggingface:  { name: "Hugging Face",   color: "#FFD21E", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="10" fill="#FFD21E"/><path fill="#000" d="M8 10a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm8 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm-4 8c3.31 0 6-1.34 6-3v-2c0-1.66-2.69-3-6-3s-6 1.34-6 3v2c0 1.66 2.69 3 6 3z"/></svg>' },
    google:       { name: "Google Scholar",  color: "#4285F4", icon: '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#fff" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' },
  };

  function sourceBadgeHtml(source, url) {
    const info = SOURCES[source];
    if (!info) return escapeHtml(source);
    const href = url ? ` href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"` : "";
    return `<a class="source-badge" style="--badge-color:${info.color}"${href} title="Open ${escapeHtml(info.name)} profile">${info.icon}<span>${escapeHtml(info.name)}</span></a>`;
  }

  /* ---------- rendering ---------- */

  function renderResults(data) {
    allCandidates = data.candidates || [];
    lastJobDescription = input.value.trim() || lastJobDescription;
    applyFilterAndSort();
    bottomBar.classList.remove("hidden");
  }

  function applyFilterAndSort() {
    let filtered = allCandidates.filter((c) => {
      const score = c.relevance_score || 0;
      if (score * 100 < threshold) return false;
      if (activeFilter !== "all" && matchCategory(score) !== activeFilter) return false;
      return true;
    });

    if (activeSort === "name") {
      filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    // default "score" sort keeps API order (already sorted by backend)

    renderStats();
    renderCards(filtered);
    bottomCount.textContent = `${filtered.length} candidate${filtered.length !== 1 ? "s" : ""}`;
  }

  function renderStats() {
    const counts = { strong: 0, good: 0, review: 0 };
    allCandidates.forEach((c) => {
      const score = c.relevance_score || 0;
      if (score * 100 >= threshold) counts[matchCategory(score)]++;
    });
    resultsStats.innerHTML = "";
    resultsStats.appendChild(el("span", "stat stat-strong", `${counts.strong} Strong`));
    resultsStats.appendChild(el("span", "stat stat-good", `${counts.good} Good`));
    resultsStats.appendChild(el("span", "stat stat-review", `${counts.review} Review`));
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

    /* header: name + score */
    const header = el("div", "cand-header");
    const nameEl = el("div", "cand-name", c.name || `Candidate ${index + 1}`);
    header.appendChild(nameEl);
    const scoreBlock = el("div", "cand-score");
    scoreBlock.appendChild(el("div", `score-number ${cat}`, `${pct}%`));
    scoreBlock.appendChild(el("div", "score-label", matchLabel(cat)));
    header.appendChild(scoreBlock);
    card.appendChild(header);

    /* match bar */
    const bar = el("div", "cand-match-bar");
    const fill = el("div", `cand-match-fill ${cat}`);
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    card.appendChild(bar);

    /* role */
    const roleText = c.role || c.headline || "";
    if (roleText) card.appendChild(el("div", "cand-role", roleText));

    /* meta row: experience · location */
    const metaParts = [];
    if (c.experience) metaParts.push(c.experience);
    if (c.location) metaParts.push(c.location);
    if (metaParts.length) {
      const metaRow = el("div", "cand-meta-row");
      metaParts.forEach((p, i) => {
        if (i > 0) metaRow.appendChild(el("span", "sep", "\u00B7"));
        metaRow.appendChild(el("span", "", p));
      });
      card.appendChild(metaRow);
    }

    /* skills */
    if (Array.isArray(c.skills) && c.skills.length) {
      const skills = el("div", "cand-skills");
      c.skills.slice(0, 6).forEach((s) => {
        skills.appendChild(el("span", "skill matched", s));
      });
      if (c.skills.length > 6) {
        skills.appendChild(el("span", "skill", `+${c.skills.length - 6}`));
      }
      card.appendChild(skills);
    }

    /* summary */
    if (c.summary) {
      card.appendChild(el("div", "cand-summary", c.summary));
    }

    /* footer: source badge + actions */
    const footer = el("div", "cand-footer");

    if (c.source) {
      const badgeWrap = document.createElement("span");
      badgeWrap.innerHTML = sourceBadgeHtml(c.source, c.url);
      footer.appendChild(badgeWrap);
    }

    const actions = el("div", "cand-actions");

    const viewBtn = el("button", "btn-sm primary", "View Profile");
    viewBtn.addEventListener("click", (e) => {
      e.preventDefault();
      showCandidateDetail(c, index);
    });
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

    const bar = `<div class="cand-match-bar"><div class="cand-match-fill ${cat}" style="width:${pct}%"></div></div>`;
    html += bar;

    if (c.skills && c.skills.length) {
      html += `<div class="detail-section"><h3>Skills</h3><div class="detail-skills">`;
      c.skills.forEach((s) => { html += `<span class="skill matched">${escapeHtml(s)}</span>`; });
      html += `</div></div>`;
    }

    if (lastJobDescription) {
      html += `<div class="detail-section"><h3>Why This Candidate Matches</h3>`;
      html += `<div class="detail-match-text">${escapeHtml(generateMatchExplanation(c))}</div></div>`;
    }

    html += `<div class="detail-section"><h3>Details</h3><table class="requirement-table">`;
    if (c.location) html += `<tr><td>Location</td><td>${escapeHtml(c.location)}</td></tr>`;
    if (c.experience) html += `<tr><td>Experience</td><td>${escapeHtml(c.experience)}</td></tr>`;
    if (c.source) html += `<tr><td>Source</td><td>${sourceBadgeHtml(c.source, c.url)}</td></tr>`;
    if (c.url) {
      html += `<tr><td>Profile</td><td><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;font-size:13px">${escapeHtml(c.url).replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></td></tr>`;
    }
    html += `</table></div>`;

    if (c.summary) {
      html += `<div class="detail-section"><h3>Summary</h3><div class="detail-match-text">${escapeHtml(c.summary)}</div></div>`;
    }

    /* action buttons at bottom of detail */
    html += `<div style="display:flex;gap:8px;margin-top:16px">`;
    if (c.url) {
      html += `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="flex:1;text-decoration:none;text-align:center">Open Profile</a>`;
    }
    const isShort = shortlisted.has(c.url);
    html += `<button class="btn-ghost detail-shortlist-btn${isShort ? " shortlisted" : ""}" data-url="${escapeHtml(c.url || "")}" style="flex:1">${isShort ? "Shortlisted" : "Shortlist"}</button>`;
    html += `</div>`;

    candidateDetail.innerHTML = html;

    /* wire up detail shortlist button */
    const detailShortBtn = candidateDetail.querySelector(".detail-shortlist-btn");
    if (detailShortBtn) {
      detailShortBtn.addEventListener("click", () => {
        const url = detailShortBtn.dataset.url;
        if (shortlisted.has(url)) {
          shortlisted.delete(url);
          detailShortBtn.classList.remove("shortlisted");
          detailShortBtn.textContent = "Shortlist";
        } else {
          shortlisted.add(url);
          detailShortBtn.classList.add("shortlisted");
          detailShortBtn.textContent = "Shortlisted";
        }
        saveShortlist();
        applyFilterAndSort();
      });
    }

    candidateModal.classList.remove("hidden");
  }

  function generateMatchExplanation(c) {
    const skills = c.skills || [];
    const parts = [];
    if (c.name) parts.push(`${c.name} is a strong candidate`);
    else parts.push("This is a strong candidate");
    if (skills.length > 0) parts.push(`with demonstrated experience in ${skills.join(", ")}`);
    const role = c.role || c.headline || "";
    if (role) parts.push(`currently working as ${role}`);
    if (c.experience) parts.push(`with ${c.experience}`);
    const pct = Math.round((c.relevance_score || 0) * 100);
    parts.push(`Matching ${pct}% of the job requirements.`);
    return parts.join(" ");
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
    skeletonList.classList.remove("hidden");
    resultsTitle.textContent = "Searching...";
    resultsStats.innerHTML = "";
    candidatesList.innerHTML = "";

    /* show stream status on mobile */
    streamStatus.classList.remove("hidden");
    streamStatus.textContent = "Connecting to search service...";

    try {
      const res = await fetch(`${settings.baseUrl}/scraping-agent?stream=1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
        },
        body: JSON.stringify({ job_description: text, max_candidates: CONFIG.MAX_CANDIDATES }),
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
          resultsTitle.textContent = msg.message || "Searching...";
          streamStatus.textContent = msg.message || "";
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

      skeletonList.classList.add("hidden");
      streamStatus.classList.add("hidden");

      if (result) {
        renderResults(result);
      } else {
        emptyState.classList.remove("hidden");
        resultsTitle.textContent = "No Candidates Found";
      }
    } catch (err) {
      skeletonList.classList.add("hidden");
      streamStatus.classList.add("hidden");
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
    input.style.height = `${Math.min(input.scrollHeight, 240)}px`;
  }

  /* ---------- filter modal ---------- */

  function openFilterModal() {
    /* sync current state into modal */
    $$(".fpill", $("#filter-match-pills")).forEach((p) => {
      p.classList.toggle("active", p.dataset.filter === activeFilter);
    });
    $("#filter-threshold").value = threshold;
    $("#filter-threshold-val").textContent = `${threshold}%`;
    $$(".fpill", $("#filter-sort-pills")).forEach((p) => {
      p.classList.toggle("active", p.dataset.sort === activeSort);
    });
    filterModal.classList.remove("hidden");
  }

  function closeFilterModal() {
    filterModal.classList.add("hidden");
  }

  function applyFilterModal() {
    const activePill = $(".fpill.active", $("#filter-match-pills"));
    activeFilter = activePill ? activePill.dataset.filter : "all";

    const activeSortPill = $(".fpill.active", $("#filter-sort-pills"));
    activeSort = activeSortPill ? activeSortPill.dataset.sort : "score";

    threshold = parseInt($("#filter-threshold").value, 10);
    applyFilterAndSort();
    closeFilterModal();
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

  /* ---------- init ---------- */

  function init() {
    renderSuggestions();

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
      skeletonList.classList.add("hidden");
      emptyState.classList.add("hidden");
      errorState.classList.add("hidden");
      candidatesList.innerHTML = "";
      bottomBar.classList.add("hidden");
      streamStatus.classList.add("hidden");
      input.value = "";
      input.focus();
    });

    $("#retry-btn").addEventListener("click", send);
    $("#modify-search-btn").addEventListener("click", () => {
      searchSection.classList.remove("compact");
      resultsSection.classList.add("hidden");
      emptyState.classList.add("hidden");
      bottomBar.classList.add("hidden");
      input.focus();
    });

    /* candidate modal close */
    $("#candidate-close").addEventListener("click", () => candidateModal.classList.add("hidden"));
    candidateModal.querySelector(".modal-backdrop").addEventListener("click", () => candidateModal.classList.add("hidden"));

    /* filter modal */
    bottomFilterBtn.addEventListener("click", openFilterModal);
    filterModal.querySelector(".modal-backdrop").addEventListener("click", closeFilterModal);
    $("#filter-apply").addEventListener("click", applyFilterModal);
    $("#filter-reset").addEventListener("click", () => {
      activeFilter = "all";
      activeSort = "score";
      threshold = 0;
      applyFilterAndSort();
      closeFilterModal();
    });

    /* filter pill toggles */
    $("#filter-match-pills").addEventListener("click", (e) => {
      const pill = e.target.closest(".fpill");
      if (!pill) return;
      $$(".fpill", $("#filter-match-pills")).forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });
    $("#filter-sort-pills").addEventListener("click", (e) => {
      const pill = e.target.closest(".fpill");
      if (!pill) return;
      $$(".fpill", $("#filter-sort-pills")).forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
    });

    /* threshold slider */
    $("#filter-threshold").addEventListener("input", (e) => {
      $("#filter-threshold-val").textContent = `${e.target.value}%`;
    });

    /* bottom bar sort (quick toggle) */
    bottomSortBtn.addEventListener("click", () => {
      activeSort = activeSort === "score" ? "name" : "score";
      applyFilterAndSort();
    });

    /* initial sort pill label */
    const updateSortLabel = () => {
      bottomSortBtn.childNodes[bottomSortBtn.childNodes.length - 1].textContent = activeSort === "score" ? " Sort" : " Name";
    };
    const origApply = applyFilterAndSort;
    /* wrap to update label */
    const _orig = applyFilterAndSort;

    setStatus("", "checking\u2026");
    checkHealth();
  }

  init();
})();
