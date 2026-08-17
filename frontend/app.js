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
    const label = el("div", "typing-text", "Connecting to the backend…");
    bubble.appendChild(label);
    row.appendChild(bubble);
    chat.appendChild(row);
    scrollBottom();
    return {
      row,
      setText: (text) => {
        label.textContent = text;
        scrollBottom();
      },
      remove: () => row.remove(),
    };
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

  const SOURCE_ICONS = {
    github: '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>',
    wellfound: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M13.836 1.968a.45.45 0 00-.362.062L6.47 6.678a.45.45 0 00-.168.36v8.794c0 .145.078.28.206.35l5.336 2.897a.45.45 0 00.412 0l5.336-2.897a.45.45 0 00.206-.35V7.038a.45.45 0 00-.168-.36l-3.45-2.208a.45.45 0 00-.138-.062l-1.014-.463-.006.003-.001-.001-.003.002-.622.284z"/></svg>',
    indeed: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M22.417 7.072H1.583C.71 7.072 0 7.78 0 8.655v6.69c0 .874.71 1.583 1.583 1.583h20.834c.874 0 1.583-.71 1.583-1.583v-6.69c0-.874-.71-1.583-1.583-1.583zM8.27 15.28H5.07V10.7h3.2v4.58zM6.67 9.377a1.87 1.87 0 110-3.74 1.87 1.87 0 010 3.74zm11.44 5.903h-3.2v-2.31c0-.872-.016-1.993-1.214-1.993-1.215 0-1.4 1.027-1.4 2.11v4.193h-3.2V10.7h3.076v1.414h.044c.43-.815 1.484-1.67 3.053-1.67 3.264 0 3.867 2.15 3.867 4.95v4.874z"/></svg>',
    stackoverflow: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M15.725 0l-1.72 1.277 6.39 8.588 1.72-1.277L15.725 0zm-3.94 3.418l-1.369 1.644 8.225 6.85 1.369-1.644-8.225-6.85zm-3.15 4.465l-.905 2.02 10.052 4.474.905-2.02L8.636 7.883zm1.783 4.83l-.814 1.89 9.087 3.912.814-1.89-9.087-3.912zM5.882 17.85l-.758 1.96 9.636 3.667.758-1.96-9.636-3.667zM2.48 21.12l-.692 2.03 10.072 3.438.692-2.03L2.48 21.12z"/></svg>',
    kaggle: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M18.825 23.859c-.258.564-.847.935-1.528.935H6.703c-.681 0-1.27-.371-1.528-.935L.005 12.892C-.261 12.315.067 11.63.706 11.36c.636-.271 1.377.025 1.741.654l3.457 6.468h12.191l3.457-6.468c.364-.629 1.105-.925 1.741-.654.639.27.967.955.701 1.532l-5.17 10.967zM12 0c4.971 0 9 4.029 9 9s-4.029 9-9 9-9-4.029-9-9 4.029-9 9-9zm0 2.5c-3.589 0-6.5 2.911-6.5 6.5s2.911 6.5 6.5 6.5 6.5-2.911 6.5-6.5-2.911-6.5-6.5-6.5z"/></svg>',
    devto: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M7.42 10c0-1.035.837-1.875 1.875-1.875S11.17 8.965 11.17 10v.875c0 1.036-.837 1.875-1.875 1.875S7.42 11.911 7.42 10.875V10zm5.724 0c0-1.035.837-1.875 1.875-1.875s1.875.84 1.875 1.875v.875c0 1.036-.838 1.875-1.875 1.875s-1.875-.839-1.875-1.875V10zM12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.75 16.5H5.25a1.5 1.5 0 01-1.5-1.5V9a1.5 1.5 0 011.5-1.5h13.5a1.5 1.5 0 011.5 1.5v6a1.5 1.5 0 01-1.5 1.5z"/></svg>',
    hashnode: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M22.29 7.924h-4.764c-.238 0-.438.164-.49.389l-.012.054c-.18.847-.556 1.626-1.092 2.275a6.337 6.337 0 01-1.86 1.559c-.69.365-1.459.58-2.255.635l-.116.008H12.22v6.166a2.173 2.173 0 01-.056.513l-.02.094a2.718 2.718 0 01-2.667 2.223h-.17a2.718 2.718 0 01-2.716-2.674l-.003-.053V14.64h-.92A2.721 2.721 0 013 11.92v-.013c.006-.14.042-.278.104-.404l.025-.047A2.713 2.713 0 015.758 9h3.164V4.656a.49.49 0 01.489-.489h3.182a.49.49 0 01.489.489V9h3.146a2.718 2.718 0 012.665 3.173l-.018.112a2.72 2.72 0 01-.085.328l-.006.015c-.037.082-.08.162-.128.238a2.714 2.714 0 01-1.835 1.133l-.12.022h-2.268v5.455h-.116c-.796.055-1.565.27-2.255.635a6.337 6.337 0 01-1.86 1.559 5.768 5.768 0 01-1.092 2.275l-.012.054a.49.49 0 01-.49.389h-.01"/></svg>',
    artstation: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M0 17.723l2.027 3.505h.001a2.424 2.424 0 002.164 1.333h13.457l-2.792-4.838H0zm24 .025c0-.466-.232-.902-.62-1.169L14.783 1.47a2.424 2.424 0 00-2.164-1.334H6.039l8.561 14.831 6.357 2.057z"/></svg>',
    dribbble: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.04 6.4 1.73 1.358 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4-.81zm-11.62-2.58c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.17zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702-1.81-1.61-4.19-2.586-6.795-2.586-.825 0-1.63.1-2.4.288zm10.335 3.483c-.218.29-1.89 2.478-5.662 4.023.242.498.475 1.002.688 1.51.075.18.148.36.22.54 3.41-.43 6.8.26 7.14.33-.02-2.42-.88-4.64-2.38-6.4z"/></svg>',
    researchgate: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M19.586 0c-1.394 0-2.575.61-3.293 1.458C15.569.611 14.389 0 12.994 0 9.77 0 8.377 3.073 8.377 5.703v1.614H6.29c-1.406 0-2.59.61-3.309 1.468C2.197 8.61 1.5 9.838 1.5 11.25c0 1.412.697 2.64 1.48 2.468.784-.17 1.968.61 3.31 2.03 1.343 1.42 1.976 3.175 1.976 3.175h.114V24h7.58V11.25h3.538V24H22.5V7.317c0-3.988-1.547-7.317-2.914-7.317z"/></svg>',
    producthunt: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M13.604 8.4h-3.405V12h3.405c1.002 0 1.801-.799 1.801-1.8 0-1.001-.799-1.8-1.801-1.8zM12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm1.604 14.4h-3.405V18H7.801V6h5.804c2.319 0 4.2 1.88 4.2 4.2 0 2.318-1.881 4.2-4.201 4.2z"/></svg>',
    orcid: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zM7.369 4.378c.525 0 .947.431.947.947s-.422.947-.947.947a.95.95 0 01-.947-.947c0-.525.422-.947.947-.947zm-.722 3.038v8.404h1.444V7.416H6.647zm3.563 0v8.404h1.444v-4.19c0-1.325.488-2.076 1.513-2.076 1.004 0 1.27.704 1.27 1.853v4.413h1.444v-4.69c0-2.115-.606-3.382-2.588-3.382-1.06 0-1.78.474-2.217.974V7.416h-1.444z"/></svg>',
    indiehackers: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.5 17h-3l-2-3.5L10.5 17h-3l3.5-6-3-5.5h3l2 3.5 2.5-3.5h3l-3.5 6 3 5.5z"/></svg>',
    huggingface: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M12 2c2.5 0 4.5 2 4.5 4.5v1h-9v-1c0-2.5 2-4.5 4.5-4.5zm-7 6.5h14c.83 0 1.5.67 1.5 1.5v4c0 3.5-3 6.5-6.5 6.5h-4C5.5 20 2.5 17 2.5 13.5v-4c0-.83.67-1.5 1.5-1.5z"/></svg>',
    google: '<svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>',
  };

  function sourceIcon(source) {
    return SOURCE_ICONS[source] || "";
  }

  function sourceDisplayName(source) {
    const names = {
      github: "GitHub", linkedin: "LinkedIn", wellfound: "Wellfound",
      indeed: "Indeed", stackoverflow: "Stack Overflow", kaggle: "Kaggle",
      devto: "DEV.to", hashnode: "Hashnode", artstation: "ArtStation",
      dribbble: "Dribbble", researchgate: "ResearchGate", orcid: "ORCID",
      producthunt: "Product Hunt", indiehackers: "Indie Hackers",
      huggingface: "Hugging Face", google: "Google Scholar",
    };
    return names[source] || source;
  }

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
          ? ` Sources that returned results: ${okSources.join(", ")} \u2014 try rephrasing the job description with clearer skills.`
          : " The search providers returned nothing \u2014 try different wording or check the API is up.");
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
      const count = s.status === "ok" ? ` \u00b7 ${s.candidates_found}` : "";
      chip.append(` \u00b7 ${s.status}${count}`);
      if (s.error) chip.title = s.error;
      sources.appendChild(chip);
    });
    wrap.appendChild(sources);

    const note = el("p", "assistant-note");
    note.textContent = data.partial
      ? "Request hit the time budget \u2014 showing partial results."
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

    const nameRole = el("div", "cand-name-role");
    nameRole.appendChild(el("div", "cand-name", c.name || `Candidate ${index + 1}`));
    const roleText = c.role || c.headline || "";
    if (roleText) nameRole.appendChild(el("div", "cand-role", roleText));
    title.appendChild(nameRole);
    head.appendChild(title);

    if (c.source) {
      const badge = el("span", "source-badge");
      const icon = sourceIcon(c.source);
      if (icon) badge.innerHTML = icon;
      badge.appendChild(document.createTextNode(" " + sourceDisplayName(c.source)));
      badge.title = sourceDisplayName(c.source);
      head.appendChild(badge);
    }
    card.appendChild(head);

    const meta = el("div", "cand-meta");
    if (c.location) {
      const loc = el("span", "cand-location");
      loc.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12"><path fill="currentColor" d="M12.166 8.94c-.524 1.062-1.234 2.12-1.96 3.07A31.493 31.493 0 018 14.58a31.481 31.481 0 01-2.206-2.57c-.726-.95-1.436-2.006-1.96-3.07C3.304 7.867 3 6.862 3 6a5 5 0 0110 0c0 .862-.305 1.867-.834 2.94zM8 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg> ' + escapeHtml(c.location);
      meta.appendChild(loc);
    }
    if (c.url) {
      const link = el("a", "cand-link", c.url.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      link.href = c.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      meta.appendChild(link);
    }
    card.appendChild(meta);

    if (Array.isArray(c.skills) && c.skills.length) {
      const skills = el("div", "skills");
      c.skills.slice(0, 8).forEach((s) => skills.appendChild(el("span", "skill", s)));
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
        setStatus("ok", data.mode === "llm+heuristic" ? "API online (LLM)" : "API online");
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
    const typing = addTyping();

    const showError = (detail) => {
      const bubble = el("div", "msg assistant error");
      bubble.appendChild(el("div", "bubble", detail));
      chat.appendChild(bubble);
      scrollBottom();
    };

    try {
      const res = await fetch(`${settings.baseUrl}/scraping-agent?stream=1`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(settings.apiKey ? { "X-API-Key": settings.apiKey } : {}),
        },
        body: JSON.stringify({
          job_description: text,
          max_candidates: CONFIG.MAX_CANDIDATES,
        }),
        signal: AbortSignal.timeout(300000),
      });

      if (!res.ok) {
        let detail = `Request failed (${res.status})`;
        const data = await res.json().catch(() => ({}));
        if (data.detail) detail = data.detail;
        if (res.status === 401) {
          detail = "401 Unauthorized — this API requires an API key. Open Settings and add it.";
        } else if (res.status === 503) {
          detail = "503 Upstream failure — the backend couldn't reach an LLM or search provider. Try again shortly.";
        }
        typing.remove();
        showError(detail);
        return;
      }

      if (!res.body) {
        typing.remove();
        showError("The API did not return a stream. Check the base URL and redeploy the backend.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let result = null;

      const handleLine = (line) => {
        const msg = JSON.parse(line);
        if (msg.type === "status") {
          typing.setText(msg.message);
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

      typing.remove();

      if (!result && buf.trim()) {
        try {
          result = JSON.parse(buf.trim());
        } catch {
          /* ignore */
        }
      }

      if (result) {
        renderCandidates(result);
        setStatus("ok", "API online");
      } else {
        showError("The API finished without returning candidates.");
      }
    } catch (err) {
      typing.remove();
      let detail = "Could not reach the API. Check that it's deployed and your base URL is correct.";
      if (err.name === "TimeoutError") {
        detail = "Request timed out after 5 minutes. Try a shorter job description.";
      } else if (err.apiStatus === 503) {
        detail = "503 Upstream failure — the backend couldn't reach an LLM or search provider. Try again shortly.";
      } else if (err.message && err.message !== "AbortError") {
        detail = err.message;
      }
      showError(detail);
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

  /* ---------- sources dropdown ---------- */

  function initSourcesMenu() {
    const btn = document.getElementById("sources-btn");
    const menu = document.getElementById("sources-menu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("hidden");
      btn.setAttribute("aria-expanded", String(!open));
    });
    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    });
    document.addEventListener("click", () => {
      menu.classList.add("hidden");
      btn.setAttribute("aria-expanded", "false");
    });
  }

  /* ---------- init ---------- */

  function init() {
    renderSuggestions();
    initSourcesMenu();

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
