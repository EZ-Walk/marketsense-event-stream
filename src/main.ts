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
  rawId?: string | number; // Original DB id for tracking
};

type PostgresTable = {
  name: string;
  displayName: string;
  idColumn: string;
  timestampColumn: string;
  rowCount: number;
};

type AppState = {
  user: User | null;
  error?: string;
  filter: string;
  expanded: boolean;
  consumptionRate: number;
  activeSource: "postgres" | "mock";
  activeTable: string;
  showTableSelector: boolean;
};

const SESSION_KEY = "ms-auth-session";
const PROCESSED_EVENTS_KEY = "ms-processed-events";
const MOCK_API_KEY = "ms_test_key_2025";
const MOCK_USER: User = {
  name: "Demo Analyst",
  email: "demo@marketsense.test",
  role: "analyst",
  token: ""
};

const SUPABASE_PROJECT_ID = "cstbgyiuywcwjafqsadu";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzdGJneWl1eXdjd2phZnFzYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc3MDIwOTQsImV4cCI6MjA3MzI3ODA5NH0.-fjJit2tO5-ecpmDaxTo6LIopWKW0otmvTTOMvP7TpQ";

// Available Postgres tables for event streaming
const POSTGRES_TABLES: PostgresTable[] = [
  {
    name: "staff_room_events",
    displayName: "Staff Room Events",
    idColumn: "id",
    timestampColumn: "created_at",
    rowCount: 903
  },
  {
    name: "temp_events",
    displayName: "Temp Events",
    idColumn: "id",
    timestampColumn: "created_at",
    rowCount: 3983
  },
  {
    name: "events",
    displayName: "Events (Structured)",
    idColumn: "id",
    timestampColumn: "created_at",
    rowCount: 0
  },
  {
    name: "trello_events",
    displayName: "Trello Events",
    idColumn: "id",
    timestampColumn: "ingested_at",
    rowCount: 0
  }
];

let state: AppState = {
  user: loadSession(),
  filter: "",
  expanded: false,
  consumptionRate: 5000,
  activeSource: "postgres",
  activeTable: "staff_room_events",
  showTableSelector: false
};

let events: StreamEvent[] = [];
let currentPill: StreamEvent | null = null;
let feedTimeout: number | null = null;
let processedEventIds: Set<string> = new Set();

const sources = {
  postgres: {
    name: `Supabase (${SUPABASE_PROJECT_ID})`,
    fetchLatest: async () => fetchFromSupabase(1, state.activeTable),
    fetchInitial: async (limit = 10) => fetchFromSupabase(limit, state.activeTable)
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
      loadProcessedEventIds();
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
  const activeTableInfo = POSTGRES_TABLES.find(t => t.name === state.activeTable);
  const displayTableName = activeTableInfo?.displayName || state.activeTable;
  
  return `
    <div class="page">
      <header class="appbar minimal">
        <div>
          <p class="eyebrow">Event Stream</p>
          <h1>MarketSense Stream</h1>
          <p class="muted">
            Connected: <span class="active-source">${SUPABASE_PROJECT_ID}</span>
            ${state.activeSource === "postgres" ? ` / ${displayTableName}` : ""}
          </p>
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

        <button class="stream-node source" id="source-selector-btn" title="Click to select event source">
          <div class="node-icon"></div>
          <span class="node-label">${state.activeSource === "postgres" ? displayTableName : state.activeSource}</span>
        </button>
      </section>

      ${state.showTableSelector ? renderTableSelector() : ""}

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

function renderTableSelector() {
  const processedCount = processedEventIds.size;
  
  return `
    <div class="modal-overlay" id="table-selector-overlay">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h2>Select Event Source</h2>
            <p class="muted">Choose a table to stream events from</p>
          </div>
          <button class="btn ghost icon-only" id="close-table-selector">✕</button>
        </div>
        <div class="modal-body">
          <div class="source-type-toggle">
            <button 
              class="btn ${state.activeSource === "postgres" ? "primary" : "ghost"}" 
              data-source="postgres"
            >
              Postgres Tables
            </button>
            <button 
              class="btn ${state.activeSource === "mock" ? "primary" : "ghost"}" 
              data-source="mock"
            >
              Mock Data
            </button>
          </div>
          
          ${state.activeSource === "postgres" ? `
            <ul class="table-list">
              ${POSTGRES_TABLES.map(table => `
                <li 
                  class="table-item ${table.name === state.activeTable ? "active" : ""}"
                  data-table="${table.name}"
                >
                  <div class="table-info">
                    <h3>${table.displayName}</h3>
                    <p class="muted small">${table.name}</p>
                  </div>
                  <div class="table-meta">
                    <span class="pill">${table.rowCount} rows</span>
                    ${table.name === state.activeTable ? '<span class="badge success">Active</span>' : ""}
                  </div>
                </li>
              `).join("")}
            </ul>
          ` : `
            <div class="info-box">
              <p>Mock data generates synthetic events in-memory for testing purposes.</p>
            </div>
          `}
          
          <div class="info-box">
            <p class="small muted">
              <strong>Processed:</strong> ${processedCount} events tracked in local storage
              <button class="btn ghost small" id="clear-processed-btn">Clear History</button>
            </p>
          </div>
        </div>
      </div>
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
    state = { 
      user: null, 
      filter: "", 
      expanded: false, 
      consumptionRate: 5000, 
      activeSource: "postgres",
      activeTable: "staff_room_events",
      showTableSelector: false
    };
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

  // New: Source selector button
  const sourceSelectorBtn = appRoot.querySelector<HTMLButtonElement>("#source-selector-btn");
  sourceSelectorBtn?.addEventListener("click", () => {
    state = { ...state, showTableSelector: !state.showTableSelector };
    render();
  });

  // New: Table selector modal interactions
  if (state.showTableSelector) {
    const closeBtn = appRoot.querySelector<HTMLButtonElement>("#close-table-selector");
    closeBtn?.addEventListener("click", () => {
      state = { ...state, showTableSelector: false };
      render();
    });

    const overlay = appRoot.querySelector<HTMLDivElement>("#table-selector-overlay");
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) {
        state = { ...state, showTableSelector: false };
        render();
      }
    });

    // Source type toggle buttons
    const sourceTypeBtns = appRoot.querySelectorAll<HTMLButtonElement>("[data-source]");
    sourceTypeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const sourceType = btn.getAttribute("data-source") as "postgres" | "mock";
        if (sourceType !== state.activeSource) {
          state.activeSource = sourceType;
          events = [];
          currentPill = null;
          render();
          initialize();
        }
      });
    });

    // Table selection
    const tableItems = appRoot.querySelectorAll<HTMLLIElement>("[data-table]");
    tableItems.forEach(item => {
      item.addEventListener("click", () => {
        const tableName = item.getAttribute("data-table");
        if (tableName && tableName !== state.activeTable) {
          state.activeTable = tableName;
          state.showTableSelector = false;
          events = [];
          currentPill = null;
          stopLiveFeed();
          render();
          initialize();
        }
      });
    });

    // Clear processed events
    const clearBtn = appRoot.querySelector<HTMLButtonElement>("#clear-processed-btn");
    clearBtn?.addEventListener("click", () => {
      if (confirm("Clear all processed event tracking? This will reset the FIFO queue.")) {
        processedEventIds.clear();
        saveProcessedEventIds();
        render();
      }
    });
  }
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
      // FIFO queue logic: only add unprocessed events
      const eventKey = `${state.activeTable}:${newEvent.rawId || newEvent.id}`;
      
      if (!processedEventIds.has(eventKey) && !events.find(e => e.id === newEvent.id)) {
        events = [newEvent, ...events].slice(0, 50);
        currentPill = newEvent;
        
        // Mark as processed
        processedEventIds.add(eventKey);
        saveProcessedEventIds();
        
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

async function fetchFromSupabase(limit: number, tableName: string) {
  const tableInfo = POSTGRES_TABLES.find(t => t.name === tableName);
  if (!tableInfo) throw new Error(`Unknown table: ${tableName}`);

  // FIFO: Fetch oldest unprocessed events first (ASC order)
  const response = await fetch(
    `https://${SUPABASE_PROJECT_ID}.supabase.co/rest/v1/${tableName}?select=*&order=${tableInfo.timestampColumn}.asc&limit=${limit}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch from ${tableName}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  // Filter out already processed events and return the oldest unprocessed
  const unprocessed = data.filter((row: any) => {
    const eventKey = `${tableName}:${row[tableInfo.idColumn]}`;
    return !processedEventIds.has(eventKey);
  });
  
  return unprocessed.slice(0, limit).map((row: any) => mapDbRow(row, tableName, tableInfo));
}

function mapDbRow(dbRow: any, tableName: string, tableInfo: PostgresTable): StreamEvent {
  const timestamp = dbRow[tableInfo.timestampColumn] 
    ? new Date(dbRow[tableInfo.timestampColumn]).getTime() 
    : Date.now();
  
  // Table-specific mapping
  switch (tableName) {
    case "staff_room_events":
      return {
        id: dbRow.id,
        rawId: dbRow.id,
        type: dbRow.event_data?.action?.type || dbRow.source_node || "workflow",
        source: tableName,
        description: dbRow.event_data?.action?.data?.card?.name 
          ? `Card: ${dbRow.event_data.action.data.card.name}` 
          : `Workflow: ${dbRow.workflow_id || "unknown"}`,
        status: "processed",
        timestamp
      };
      
    case "temp_events":
      return {
        id: dbRow.id?.toString() || randomId(),
        rawId: dbRow.id,
        type: dbRow.event_type || "unknown",
        source: dbRow.workspace_name || "notion",
        description: dbRow.event_data?.parent?.type 
          ? `${dbRow.event_type} on ${dbRow.event_data.parent.type}` 
          : dbRow.event_type || "Event",
        status: "processed",
        timestamp
      };
      
    case "events":
      return {
        id: dbRow.id,
        rawId: dbRow.id,
        type: dbRow.event_type || "unknown",
        source: dbRow.source || "system",
        description: dbRow.payload?.description || `Event from ${dbRow.source}`,
        status: dbRow.processed ? "processed" : "pending",
        timestamp
      };
      
    case "trello_events":
      return {
        id: dbRow.id,
        rawId: dbRow.id,
        type: dbRow.action_type || "trello",
        source: dbRow.board_name || "trello",
        description: dbRow.card_name || dbRow.translation_key || "Trello action",
        status: dbRow.processed ? "processed" : "pending",
        timestamp: dbRow.action_date ? new Date(dbRow.action_date).getTime() : timestamp
      };
      
    default:
      return {
        id: dbRow.id?.toString() || randomId(),
        rawId: dbRow.id,
        type: "unknown",
        source: tableName,
        description: JSON.stringify(dbRow).slice(0, 100),
        status: "processed",
        timestamp
      };
  }
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

function loadProcessedEventIds() {
  const raw = localStorage.getItem(PROCESSED_EVENTS_KEY);
  if (!raw) {
    processedEventIds = new Set();
    return;
  }
  try {
    const arr = JSON.parse(raw) as string[];
    processedEventIds = new Set(arr);
  } catch {
    processedEventIds = new Set();
  }
}

function saveProcessedEventIds() {
  const arr = Array.from(processedEventIds);
  localStorage.setItem(PROCESSED_EVENTS_KEY, JSON.stringify(arr));
}


