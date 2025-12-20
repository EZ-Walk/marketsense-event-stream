# MarketSense Event Stream

A single-page web application for visualizing and managing real-time event processing with the MarketSense platform.

## Overview

This SPA provides a visual control plane for monitoring event streams using the **Source → Gate → Drain** metaphor:
- **Source**: Event entry point (Supabase Postgres or in-memory mock)
- **Gate**: Single-event processing bottleneck
- **Drain**: Event exit point with expandable history view

## Current Features

### Authentication
- Mock API key authentication (`ms_test_key_2025`)
- Session persistence via localStorage
- Login/logout flows

### Event Stream Visualization
- Visual representation of Source → Gate → Drain flow
- Single-pill display in gate (simplified, non-animated)
- Consumption rate slider (1-15 seconds)
- Event source toggle (Postgres ↔ Mock)

### Data Sources
- **Postgres**: Supabase `staff_room_events` table integration
- **Mock**: In-memory event generation for testing

### Event History
- Expandable event log (click "Drain" to toggle)
- Event filtering by type/source/description
- Time-relative formatting (e.g., "2m ago")

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies (run locally, not in sandbox)
npm install

# Start development server (run locally)
npm run dev -- --host 127.0.0.1 --port 4173

# Access at http://127.0.0.1:4173/
```

### Mock API Key

Use `ms_test_key_2025` to authenticate.

## Project Structure

```
src/
├── main.ts        # Core SPA logic (auth, state, rendering, Supabase)
├── styles.css     # Visual styling for stream components
index.html         # SPA entry point
docs/
├── research-analysis.md  # Technical research + anti-patterns doc
```

## Known Issues & Anti-Patterns

See `docs/research-analysis.md` → **Current UI Learnings** for a detailed list of animation and rendering approaches that did **not** work in this iteration.

## Contributing

This is a prototype iteration. Future work should focus on proper animation choreography, real AI agent integration for gate processing, and scalable event sourcing patterns.