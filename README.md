# Summary Wizard

A web app that ingests a PDF medical record, converts it to FHIR via PhenoML,
produces a clinician-facing summary, renders an interactive health-history
timeline, and answers natural-language questions about the record via a chatbot.

All patient data is stored client-side only (IndexedDB) and auto-deleted after
8 hours.

## Important: Synthetic Data Only

This app runs on PhenoML's **Experiment plan**, which is for non-production,
non-PHI use only. Use **synthetic / fake patient records exclusively**.

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
| `PHENOML_API_BASE` | Your PhenoML instance URL |
| `PHENOML_CLIENT_ID` | PhenoML OAuth client ID |
| `PHENOML_CLIENT_SECRET` | PhenoML OAuth client secret |

## Styling

All visual values (colors, typography, spacing, shadows, motion) are controlled
from a single design-token file: `app/styles/tokens.css`. Adjusting the app's
appearance means editing that file only.
