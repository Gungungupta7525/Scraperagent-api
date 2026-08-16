(() => {
  "use strict";

  const chat = document.getElementById("chat");
  const form = document.getElementById("composer");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send-btn");
  const statusEl = document.getElementById("api-status");
  const settingsBtn = document.getElementById("settings-btn");
  const modal = document.getElementById("settings-modal");
  const suggestionsEl = document.getElementById("suggestions");

  const LS_URL = "scraperagent.api_base_url";
  const LS_KEY = "scraperagent.api_key";

  const SUGGESTIONS = [
    "Senior Python backend engineer with FastAPI and AWS",
    "Data scientist with machine learning and NLP experience",
    "Product designer, UI/UX, Figma",
    "React frontend developer, TypeScript, startup experience",
  ];

  let busy = false;

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

  function scrollBottom() {
    chat.scrollTop = chat.scrollHeight;
  }

  function addMessage(role, content) {
    const row = el("div", `msg ${role}`);
    const bubble = el("div", "bubble", content);
    row.appendChild(bubble);
    chat.appendChild(row);
    scrollBottom();
    return bubble;
  }

  function addTyping() {
    const row = el("div", "msg assistant");
    const bubble = el("div", "bubble");
    const typing = el("div", "typing");
    typing.appendChild(el("span"));
    typing.appendChild(el("span"));
    typing.appendChild(el("span"));
    bubble.appendChild(typing);
    row.appendChild(bubble);
    chat.appendChild(row);
    scrollBottom();
    return row;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function setStatus(state, label) {
    statusEl.className = "api-status" + (state ? ` ${state}` : "");
    statusEl.textContent = label;
  }

  /* ---------- rendering candidates ---------- */

  function renderCandidates(data) {
    const wrap = el("div", "bubble");

    const intro = el("p");
    const n = data.candidates.length;
    if (n === 0) {
      const okSources = (data.sources_status || [])
        .filter((s) => s.status === "ok" && s.candidates_found > 0)
        .map((s) => `${s.source} (${s.candidates_found})`);
      intro.textContent =
        "No candidates found." +
        (okSources.length
          ? ` Sources that returned results: ${okSources.join(", ")} — try rephrasing the job description with clearer skills.`
          : " The search providers returned nothing — try different wording or check the API is up.");
    } else {
      intro.textContent = `Found ${n} candidate${n === 1 ? "" : "s"}, ranked by relevance:`;
    }
    wrap.appendChild(intro);

    if (n > 0) {
      const cards = el("div", "cards");
      data.candidates.forEach((c, i) => cards.appendChild(candidateCard(c, i)));
      wrap.appendChild(cards);
    }

    const sources = el("div", "sources");
    (data.sources_status || []).forEach((s) => {
      const chip = el("span", `source-chip ${s.status}`, `${s.source}`);
      const count = s.status === "ok" ? ` · ${s.candidates_found}` : "";
      chip.append(` · ${s.status}${count}`);
      if (s.error) chip.title = s.error;
      sources.appendChild(chip);
    });
    wrap.appendChild(sources);

    const note = el("p", "assistant-note");
    note.textContent = data.partial
      ? "⚠️ Request hit the time budget — showing partial results."
      : `Sources used: ${(data.sources_used || []).join(", ") || "none"}.`;
    wrap.appendChild(note);

    const row = el("div", "msg assistant");
    row.appendChild(wrap);
    chat.appendChild(row);
    scrollBottom();
  }

  function candidateCard(c, index) {
    const card = el("div", "candidate");
    const head = el("div", "cand-head");

    const title = el("div", "cand-title");
    title.appendChild(el("span", "cand-rank", String(index + 1)));

    const nameRole = el("div");
    const name = el("div", "cand-name", c.name || `Candidate ${index + 1}`);
    const role = el("div", "cand-role", c.role || c.headline || "—");
    nameRole.appendChild(name);
    nameRole.appendChild(role);
    title.appendChild(nameRole);
    head.appendChild(title);

    if (c.source) {
      const badge = el("span", "badge", c.source);
      head.appendChild(badge);
    }
    card.appendChild(head);

    const meta = el("div", "cand-meta");
    const bits = [];
    if (c.location) bits.push(c.location);
    if (c.experience) bits.push(c.experience);
    if (bits.length) meta.appendChild(el("span", null, bits.join(" · ")));
    if (c.url) {
      const link = el("a", null, c.url);
      link.href = c.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      meta.appendChild(link);
    }
    card.appendChild(meta);

    if (c.summary) {
      card.appendChild(el("div", "cand-summary", c.summary));
    }

    if (Array.isArray(c.skills) && c.skills.length) {
      const skills = el("div", "skills");
      c.skills.slice(0, 10).forEach((s) => skills.appendChild(el("span", "skill", s)));
      card.appendChild(skills);
    }

    if (typeof c.relevance_score === "number") {
      const pct = Math.round(c.relevance_score * 100);
      const score = el("div", "score-wrap");
      const bar = el("div", "score-bar");
      const fill = el("div", "score-fill");
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      score.appendChild(bar);
      score.appendChild(el("span", "score-label", `${pct}% match`));
      card.appendChild(score);
    }

    return card;
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

  /* ---------- api ---------- */

  async function checkHealth() {
    try {
      const res = await fetch(`${settings.baseUrl}/health`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        setStatus("ok", data.llm_configured ? "API online" : "API: no LLM key");
      } else {
        setStatus("err", "API error");
      }
    } catch {
      setStatus("err", "API offline");
    }
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;

    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    autoResize();

    addMessage("user", text);
    const typingRow = addTyping();

    try {
      const res = await fetch(`${settings.baseUrl}/scraping-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
        },
        body: JSON.stringify({
          job_description: text,
          max_candidates: CONFIG.MAX_CANDIDATES,
        }),
        signal: AbortSignal.timeout(120000),
      });

      typingRow.remove();

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        let detail = data.detail || `Request failed (${res.status})`;
        if (res.status === 401) {
          detail = "401 Unauthorized — this API requires an API key. Open Settings and add it.";
        } else if (res.status === 503) {
          detail = "503 Upstream failure — the backend couldn't reach an LLM or search provider. Try again shortly.";
        }
        const bubble = el("div", "msg assistant error");
        bubble.appendChild(el("div", "bubble", detail));
        chat.appendChild(bubble);
        scrollBottom();
        return;
      }

      renderCandidates(data);
      setStatus("ok", "API online");
    } catch (err) {
      typingRow.remove();
      let detail = "Could not reach the API. Check that it's deployed and your base URL is correct.";
      if (err.name === "TimeoutError") detail = "Request timed out after 120s. Try a shorter job description.";
      const bubble = el("div", "msg assistant error");
      bubble.appendChild(el("div", "bubble", detail));
      chat.appendChild(bubble);
      scrollBottom();
      setStatus("err", "API offline");
    } finally {
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  /* ---------- composer ---------- */

  function autoResize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  function openSettings() {
    document.getElementById("settings-url").value = settings.baseUrl;
    document.getElementById("settings-key").value = settings.apiKey;
    modal.classList.remove("hidden");
  }

  function saveSettings() {
    const url = document.getElementById("settings-url").value.trim().replace(/\/+$/, "");
    if (url) localStorage.setItem(LS_URL, url);
    const key = document.getElementById("settings-key").value.trim();
    localStorage.setItem(LS_KEY, key);
    modal.classList.add("hidden");
    setStatus("", "…");
    checkHealth();
  }

  /* ---------- init ---------- */

  function init() {
    renderSuggestions();

    const intro = el("div", "msg assistant");
    const bubble = el("div", "bubble");
    bubble.textContent =
      "Hi, I'm ScraperAgent 👋 Paste a job description and I'll search public profiles " +
      "(GitHub, LinkedIn X-ray, Indeed, Wellfound and more) and return ranked candidates.";
    intro.appendChild(bubble);
    chat.appendChild(intro);
    scrollBottom();

    input.addEventListener("input", autoResize);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      send();
    });
    settingsBtn.addEventListener("click", openSettings);
    document.getElementById("settings-save").addEventListener("click", saveSettings);
    document.getElementById("settings-cancel").addEventListener("click", () => modal.classList.add("hidden"));
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    setStatus("", "checking…");
    checkHealth();
  }

  init();
})();
