import "./styles.css";

type User = {
  name: string;
  email: string;
  role: "analyst" | "admin" | "observer";
  token: string;
};

type StreamEvent = {
  id: string;
  type: string;
  source: string;
  description: string;
  status: "processed" | "pending" | "error";
  timestamp: number;
};

type AppState = {
  user: User | null;
  error?: string;
  filter: string;
  expanded: boolean;
  consumptionRate: number;
  activeSource: "postgres" | "mock";
};

const SESSION_KEY = "ms-auth-session";
const MOCK_API_KEY = "ms_test_key_2025";
const MOCK_USER: User = {
  name: "Demo Analyst",
  email: "demo@marketsense.test",
  role: "analyst",
  token: ""
};

const SUPABASE_PROJECT_ID = "cstbgyiuywcwjafqsadu";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzdGJneWl1eXdjd2phZnFzYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3MDIwOTQsImV4cCI6MjA3MzI3ODA5NH0.-fjJit2tO5-ecpmDaxTo6LIopWKW0otmvTTOMvP7TpQ";

let state: AppState = {
  user: loadSession(),
  filter: "",
  expanded: false,
  consumptionRate: 5000,
  activeSource: "postgres"
};

let events: StreamEvent[] = [];
let currentPill: StreamEvent | null = null;
let feedTimeout: number | null = null;

const sources = {
  postgres: {
    name: `Supabase (${SUPABASE_PROJECT_ID})`,
    fetchLatest: async () => fetchFromSupabase(1),
    fetchInitial: async (limit = 10) => fetchFromSupabase(limit)
  },
  mock: {
    name: "In-Memory Mock",
    fetchLatest: async () => [makeMockEvent()],
    fetchInitial: async () => Array.from({ length: 5 }, () => makeMockEvent())
  }
};

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) {
  throw new Error("App root container not found");
}

initialize();

async function initialize() {
  if (state.user) {
    try {
      const initialEvents = await sources[state.activeSource].fetchInitial(10);
      events = initialEvents;
      currentPill = initialEvents[0] ?? null;
    } catch (err) {
      console.error("Initialization failed:", err);
    }
  }
  render();
}

function render() {
  appRoot.innerHTML = state.user ? renderDashboard(state.user) : renderAuth();
  if (state.user) {
    wireDashboard();
    startLiveFeed();
  } else {
    wireAuth();
    stopLiveFeed();
  }
}

function renderAuth() {
  return `
    <div class="page">
      <header class="hero">
        <div>
          <p class="eyebrow">MarketSense</p>
          <h1>Event Stream Control Plane</h1>
          <p class="lede">
            Single page console with mock API key authentication. Use the demo key
            to explore ingestion, routing, and monitoring flows.
          </p>
          <div class="badge-list">
            <span class="badge">TypeScript SPA</span>
            <span class="badge">API Key Auth</span>
            <span class="badge">Live Events</span>
          </div>
        </div>
      </header>
      <main class="layout">
        <section class="card auth-card">
          <div class="card-header">
            <div>
              <p class="eyebrow">Authentication</p>
              <h2>Enter your API Key</h2>
              <p class="muted">Key: <code>${MOCK_API_KEY}</code></p>
            </div>
            <span class="pill success">Mock-only</span>
          </div>
          <form class="auth-form" id="login-form">
            <label>
              <span>API Key</span>
              <input name="apiKey" type="password" required placeholder="ms_test_..." autocomplete="current-password" />
            </label>
            ${state.error ? `<p class="error-text">${state.error}</p>` : ""}
            <button type="submit" class="btn primary">Connect</button>
            <p class="muted small">
              Authentication is mocked locally. Any key matching the one shown above will grant access.
              The session is persisted in local storage.
            </p>
          </form>
        </section>
      </main>
    </div>
  `;
}

function renderDashboard(user: User) {
  const filtered = filterEvents(events, state.filter);
  const activeSourceName = sources[state.activeSource].name;
  
  return `
    <div class="page">
      <header class="appbar minimal">
        <div>
          <p class="eyebrow">Event Stream</p>
          <h1>MarketSense Stream</h1>
          <p class="muted">Connected: <span class="active-source">${SUPABASE_PROJECT_ID}</span></p>
        </div>
        <div class="appbar-actions">
          <div class="consumption-control">
            <span class="eyebrow">Rate</span>
            <input 
              id="rate-slider" 
              type="range" 
              min="1000" 
              max="15000" 
              step="500" 
              value="${state.consumptionRate}"
            />
            <span class="small muted">${(state.consumptionRate / 1000).toFixed(1)}s</span>
          </div>
          <button class="btn ghost" id="logout-btn">Log out</button>
        </div>
      </header>

      <section class="visual-stream">
        <div class="stream-node drain" title="Drain">
          <button class="node-icon drain-toggle" id="drain-toggle"></button>
          <span class="node-label">Drain</span>
        </div>
        
        <div class="stream-node gate" title="Gate">
          <div class="node-icon"></div>
          <span class="node-label">Gate</span>
        </div>

        <div class="pill-rail">
          <div class="pill-track">
            <div class="pill-item processed" data-pill="current">
              <span class="pill-icon">${currentPill ? getInitials(currentPill) : "--"}</span>
            </div>
          </div>
        </div>

        <div class="stream-node source" title="Source">
          <div class="node-icon"></div>
          <span class="node-label">${state.activeSource}</span>
        </div>
      </section>

      ${
        state.expanded
          ? `
      <main class="layout compact">
        <section class="card">
          <div class="card-header compact-header">
            <div>
              <p class="eyebrow">Event history</p>
              <h2>${activeSourceName}</h2>
            </div>
            <div class="actions-row">
              <input
                id="filter-input"
                class="input"
                type="search"
                placeholder="Filter events..."
                value="${state.filter}"
              />
              <button class="btn secondary" id="source-toggle">Switch Source</button>
            </div>
          </div>
          <ul class="event-list">
            ${filtered
              .map(
                (evt) => `
                  <li class="event-row">
                    <div class="event-icon ${evt.status}"></div>
                    <div class="event-body">
                      <div class="event-meta">
                        <span class="pill">${evt.type}</span>
                        <span class="pill subtle">${evt.source}</span>
                        <span class="muted small">${formatTime(evt.timestamp)}</span>
                      </div>
                      <p class="event-desc">${evt.description}</p>
                    </div>
                    <span class="status ${evt.status}">${evt.status}</span>
                  </li>
                `
              )
              .join("")}
            ${filtered.length === 0 ? `<li class="empty">No events found.</li>` : ""}
          </ul>
        </section>
      </main>
      `
          : ""
      }
    </div>
  `;
}

function wireAuth() {
  const form = appRoot.querySelector<HTMLFormElement>("#login-form");
  if (!form) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const apiKey = (data.get("apiKey") as string).trim();

    if (apiKey === MOCK_API_KEY) {
      const user: User = {
        name: MOCK_USER.name,
        email: MOCK_USER.email,
        role: MOCK_USER.role,
        token: apiKey
      };
      state = { user, filter: "", expanded: false, consumptionRate: 5000, activeSource: "postgres" };
      saveSession(user);
      initialize();
    } else {
      state = { ...state, error: "Invalid API Key. Use the demo key provided." };
      render();
    }
  });
}

function wireDashboard() {
  const logoutBtn = appRoot.querySelector<HTMLButtonElement>("#logout-btn");
  logoutBtn?.addEventListener("click", () => {
    clearSession();
    state = { user: null, filter: "", expanded: false, consumptionRate: 5000, activeSource: "postgres" };
    render();
  });

  const rateSlider = appRoot.querySelector<HTMLInputElement>("#rate-slider");
  rateSlider?.addEventListener("input", (event) => {
    const value = parseInt((event.target as HTMLInputElement).value);
    state = { ...state, consumptionRate: value };
    stopLiveFeed();
    startLiveFeed();
    render();
  });

  const sourceToggle = appRoot.querySelector<HTMLButtonElement>("#source-toggle");
  sourceToggle?.addEventListener("click", () => {
    state.activeSource = state.activeSource === "postgres" ? "mock" : "postgres";
    events = [];
    currentPill = null;
    initialize();
  });

  const drainToggle = appRoot.querySelector<HTMLButtonElement>("#drain-toggle");
  drainToggle?.addEventListener("click", () => {
    state = { ...state, expanded: !state.expanded };
    render();
  });

  const filterInput = appRoot.querySelector<HTMLInputElement>("#filter-input");
  filterInput?.addEventListener("input", (event) => {
    const value = (event.target as HTMLInputElement).value;
    state = { ...state, filter: value };
    render();
  });
}

function filterEvents(all: StreamEvent[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return all;
  return all.filter(
    (evt) =>
      evt.type.toLowerCase().includes(trimmed) ||
      evt.source.toLowerCase().includes(trimmed) ||
      evt.description.toLowerCase().includes(trimmed)
  );
}

async function fetchLatestEvent() {
  if (!state.user) return;
  
  try {
    const source = sources[state.activeSource];
    const newEvents = await source.fetchLatest();
    
    for (const newEvent of newEvents) {
      if (!events.find(e => e.id === newEvent.id)) {
        events = [newEvent, ...events].slice(0, 50);
        currentPill = newEvent;
        render();
      }
    }
  } catch (err) {
    console.error("Failed to fetch event:", err);
  }
}

function scheduleNextFetch(runImmediately = false) {
  if (feedTimeout !== null) {
    clearTimeout(feedTimeout);
    feedTimeout = null;
  }

  const planFetch = async () => {
    await fetchLatestEvent();
    scheduleNextFetch();
  };

  if (runImmediately) {
    planFetch();
  } else {
    feedTimeout = window.setTimeout(planFetch, state.consumptionRate);
  }
}

function startLiveFeed() {
  if (feedTimeout !== null) return;
  scheduleNextFetch();
}

function stopLiveFeed() {
  if (feedTimeout !== null) {
    clearTimeout(feedTimeout);
    feedTimeout = null;
  }
}

async function fetchFromSupabase(limit: number) {
  const response = await fetch(
    `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/staff_room_events?select=*&order=started_at.desc&limit=${limit}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  const data = await response.json();
  return data.map(mapDbRow);
}

function mapDbRow(dbRow: any): StreamEvent {
  return {
    id: dbRow.id,
    type: dbRow.event_data?.action?.type || dbRow.source_node || "unknown",
    source: "postgres",
    description: dbRow.event_data?.action?.data?.card?.name 
      ? `Card: ${dbRow.event_data.action.data.card.name}` 
      : `Workflow: ${dbRow.workflow_id}`,
    status: "processed",
    timestamp: new Date(dbRow.started_at).getTime()
  };
}

function makeMockEvent(): StreamEvent {
  const types = ["ingest", "transform", "route", "enrich"];
  const sources = ["orders-api", "pricing-engine", "ai-insights", "risk-core"];
  const type = pick(types);
  const source = pick(sources);

  return {
    id: randomId(),
    type,
    source,
    status: "processed",
    description: `${type} event from ${source}`,
    timestamp: Date.now()
  };
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function getInitials(event: StreamEvent) {
  const typeInitial = event.type.charAt(0).toUpperCase();
  const sourceInitial = event.source.charAt(0).toUpperCase();
  return `${typeInitial}${sourceInitial}`;
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 1000 / 60);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleString();
}

function randomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(16).slice(2)}`;
}

function loadSession(): User | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function saveSession(user: User) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

