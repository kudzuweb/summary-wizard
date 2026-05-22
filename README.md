# Summary Wizard

A web app that ingests a PDF medical record, converts it to FHIR via PhenoML,
produces a clinician-facing summary, renders an interactive health-history
timeline, and answers natural-language questions about the record via a chatbot.

All patient data is stored **client-side only** (IndexedDB) and auto-deleted
after 8 hours. The server acts as a stateless proxy to PhenoML — it holds
credentials but never persists patient data.

## Important: Synthetic Data Only

This app runs on PhenoML's **Experiment plan**, which is for **non-production,
non-PHI use only**. Use **synthetic / fake patient records exclusively**.

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in your PhenoML credentials in .env.local
npm run dev
```

### Required Environment Variables

| Variable | Description |
|---|---|
| `PHENOML_API_BASE` | Your PhenoML instance URL (e.g. `https://yourinstance.app.pheno.ml`) |
| `PHENOML_CLIENT_ID` | PhenoML OAuth client ID |
| `PHENOML_CLIENT_SECRET` | PhenoML OAuth client secret |

To obtain credentials, sign up at [pheno.ml](https://pheno.ml) and create an
Experiment plan application. The SDK handles OAuth token exchange and refresh
automatically.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run test` | Run test suite (vitest) |

## Architecture

- **Framework:** Next.js (App Router) with TypeScript (strict mode)
- **Styling:** CSS Modules with centralized design tokens (`app/styles/tokens.css`)
- **Client state:** Zustand store for session management
- **Client storage:** IndexedDB (via `idb`) with 8-hour TTL and auto-purge
- **FHIR querying:** `fhirpath` for client-side bundle filtering
- **PhenoML SDK:** Official `phenoml` npm package (Fern-generated)

### Data flow

1. User uploads a PDF/image medical record
2. Server proxies to PhenoML `lang2fhir/documentmulti` for FHIR extraction
3. Bundle is stored client-side in IndexedDB (never on the server)
4. Summary is generated via PhenoML IPS mode
5. Timeline is rendered from the FHIR bundle
6. Chat questions are translated to FHIR search params via PhenoML, then
   executed locally against the in-memory bundle

## Styling

All visual values (colors, typography, spacing, shadows, motion) are controlled
from a single design-token file: `app/styles/tokens.css`. Adjusting the app's
appearance means editing that file only.

## Changelog

| PR | Description |
|---|---|
| 1 | Project scaffold: Next.js, TypeScript, CSS tokens, fonts |
| 2 | Contracts and types: shared type definitions, SDK confirmation |
| 3 | PhenoML client: typed server-side SDK wrapper |
| 4 | Ingestion route: PDF upload to FHIR bundle with normalization |
| 5 | Client storage: IndexedDB with 8h TTL, zustand session store |
| 6 | App shell: upload UI, state views, session provider |
| 7 | Summary: IPS summary route and collapsible section panel |
| 8 | Timeline transform: FHIR bundle to timeline events (pure logic) |
| 9 | Timeline rendering: alternating timeline with calendar ticks |
| 10 | Timeline interaction: hover emphasis, observation grouping, linked highlights |
| 11 | Query engine: NL-to-FHIR search with local execution |
| 12 | Chat UI: chat panel wired to query engine with evidence display |
| 13 | Polish: final layout, aesthetic pass, README |
